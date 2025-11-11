require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

// In-memory contests map: roomId -> contest state
const contests = new Map();

// Utility: simple ID generator
const makeId = (len = 6) => Math.random().toString(36).slice(2, 2 + len);

// Load questions from JSON file
let allQuestions = [];
try {
  const questionsData = fs.readFileSync(path.join(__dirname, 'questions.json'), 'utf8');
  allQuestions = JSON.parse(questionsData);
  console.log(`Loaded ${allQuestions.length} questions from questions.json`);
} catch (err) {
  console.error('Error loading questions.json:', err.message);
  allQuestions = [
    {
      id: 'default',
      text: 'Sample question: What is 2+2?',
      choices: ['3', '4', '5', '6'],
      answerIndex: 1
    }
  ];
}

// Get a random question from the pool
function getRandomQuestion() {
  if (allQuestions.length === 0) return null;
  return allQuestions[Math.floor(Math.random() * allQuestions.length)];
}

// Contest lifecycle helpers
function createContest(hostSocket, opts = {}) {
  const roomId = makeId(5).toUpperCase();
  const contest = {
    roomId,
    host: hostSocket.id,
    users: new Map(), // socket.id -> { name, score }
    currentQuestion: null,
    answers: new Map(), // socket.id -> { choiceIndex, time }
    questionTimer: null,
    questionInterval: null,
    questionCount: opts.questionCount || 10,
    currentQuestionIndex: 0,
    running: false
  };
  contests.set(roomId, contest);
  return contest;
}

function getLeaderboard(contest) {
  const arr = [];
  for (const [sid, u] of contest.users.entries()) {
    arr.push({ socketId: sid, name: u.name, score: u.score });
  }
  arr.sort((a, b) => b.score - a.score);
  return arr;
}

io.on('connection', (socket) => {
  console.log('socket connected', socket.id);

  // createContest by host
  socket.on('createContest', (payload, cb) => {
    const contest = createContest(socket, payload || {});
    // host automatically joins
    contest.users.set(socket.id, { name: payload && payload.name ? payload.name : 'Host', score: 0 });
    socket.join(contest.roomId);
    cb && cb({ roomId: contest.roomId });
    io.to(contest.roomId).emit('lobbyUpdate', { roomId: contest.roomId, leaderboard: getLeaderboard(contest) });
  });

  socket.on('joinContest', ({ roomId, name }, cb) => {
    const contest = contests.get(roomId);
    if (!contest) return cb && cb({ ok: false, error: 'No such contest' });
    contest.users.set(socket.id, { name: name || 'Anon', score: 0 });
    socket.join(roomId);
    io.to(roomId).emit('lobbyUpdate', { roomId, leaderboard: getLeaderboard(contest) });
    cb && cb({ ok: true });
  });

  socket.on('startContest', async ({ roomId }, cb) => {
    const contest = contests.get(roomId);
    if (!contest) return cb && cb({ ok: false, error: 'No such contest' });
    if (contest.host !== socket.id) return cb && cb({ ok: false, error: 'Not host' });
    if (contest.running) return cb && cb({ ok: false, error: 'Already running' });

    contest.running = true;
    contest.currentQuestionIndex = 0;

    const askNext = async () => {
      if (contest.currentQuestionIndex >= contest.questionCount) {
        // end contest
        contest.running = false;
        io.to(roomId).emit('contestEnded', { leaderboard: getLeaderboard(contest) });
        return;
      }

      const q = getRandomQuestion();
      if (!q) {
        io.to(roomId).emit('contestEnded', { reason: 'No questions available', leaderboard: getLeaderboard(contest) });
        contest.running = false;
        return;
      }
      contest.currentQuestion = q;
      contest.answers = new Map();
      contest.questionStart = Date.now();
      contest.allPlayersAnswered = false;

      io.to(roomId).emit('question', { id: q.id, text: q.text, choices: q.choices });

      // Wait for all players to answer or timeout after 60 seconds
      // But only proceed if at least one player has answered
      const revealTimeout = setTimeout(() => {
        if (!contest.allPlayersAnswered && contest.answers.size > 0) {
          revealAnswer();
        }
      }, 60000);

      const revealAnswer = () => {
        // Only reveal if at least one player answered
        if (contest.answers.size === 0) {
          // No one answered, skip this question and ask next
          contest.currentQuestionIndex++;
          io.to(roomId).emit('reveal', { correctIndex: q.answerIndex, scored: [], leaderboard: getLeaderboard(contest) });
          setTimeout(askNext, 2000);
          clearTimeout(revealTimeout);
          return;
        }
        
        clearTimeout(revealTimeout);
        // compute scoring
        const correctIndex = q.answerIndex;
        const scored = [];
        for (const [sid, ans] of contest.answers.entries()) {
          const user = contest.users.get(sid);
          if (!user) continue;
          if (ans.choiceIndex === correctIndex) {
            // Simple scoring: 10 points for correct
            const points = 10;
            user.score = (user.score || 0) + points;
            scored.push({ socketId: sid, name: user.name, points });
          }
        }

        contest.currentQuestionIndex++;
        io.to(roomId).emit('reveal', { correctIndex: correctIndex, scored, leaderboard: getLeaderboard(contest) });

        // Schedule next question after a brief delay to let UI show reveal
        setTimeout(askNext, 3000);
      };

      contest.revealAnswer = revealAnswer;
    };

    // Start the quiz
    await askNext();

    cb && cb({ ok: true });
  });

  socket.on('answer', ({ roomId, questionId, choiceIndex }, cb) => {
    const contest = contests.get(roomId);
    if (!contest || !contest.currentQuestion) return cb && cb({ ok: false, error: 'No active question' });
    if (contest.currentQuestion.id !== questionId) return cb && cb({ ok: false, error: 'Question mismatch' });

    // if already answered, ignore
    if (contest.answers.has(socket.id)) return cb && cb({ ok: false, error: 'Already answered' });

    contest.answers.set(socket.id, { choiceIndex, time: Date.now() });
    
    // Check if all players have answered
    if (contest.answers.size === contest.users.size) {
      contest.allPlayersAnswered = true;
      // Trigger reveal immediately
      if (contest.revealAnswer) {
        contest.revealAnswer();
      }
    }
    
    cb && cb({ ok: true });
  });

  socket.on('leaveContest', ({ roomId }, cb) => {
    const contest = contests.get(roomId);
    if (!contest) return cb && cb({ ok: false });
    contest.users.delete(socket.id);
    socket.leave(roomId);
    io.to(roomId).emit('lobbyUpdate', { roomId, leaderboard: getLeaderboard(contest) });
    cb && cb({ ok: true });
  });

  socket.on('disconnect', () => {
    // remove from any contest
    for (const contest of contests.values()) {
      if (contest.users.has(socket.id)) {
        contest.users.delete(socket.id);
        io.to(contest.roomId).emit('lobbyUpdate', { roomId: contest.roomId, leaderboard: getLeaderboard(contest) });
      }
      if (contest.host === socket.id) {
        // if host disconnected, end contest
        io.to(contest.roomId).emit('contestEnded', { reason: 'host disconnected', leaderboard: getLeaderboard(contest) });
        clearInterval(contest.questionInterval);
        contests.delete(contest.roomId);
      }
    }
  });
});

server.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));
