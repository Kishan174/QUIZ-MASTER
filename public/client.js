(function(){
  const socket = io();
  const nameInput = document.getElementById('name');
  const createBtn = document.getElementById('create');
  const joinBtn = document.getElementById('join');
  const roomIdInput = document.getElementById('roomId');
  const setup = document.getElementById('setup');
  const lobby = document.getElementById('lobby');
  const roomLabel = document.getElementById('roomLabel');
  const startBtn = document.getElementById('startContest');
  const leaveBtn = document.getElementById('leave');
  const leaders = document.getElementById('leaders');
  const questionArea = document.getElementById('questionArea');
  const questionText = document.getElementById('questionText');
  const choicesDiv = document.getElementById('choices');
  const questionCounter = document.getElementById('questionCounter');
  const revealArea = document.getElementById('revealArea');
  const revealText = document.getElementById('revealText');
  const nextQuestionMsg = document.getElementById('nextQuestionMsg');

  let currentRoom = null;
  let currentQuestion = null;
  let answerSent = false;
  let totalQuestions = 10;
  let currentQuestionNum = 0;

  createBtn.onclick = () => {
    const name = nameInput.value || 'Host';
    socket.emit('createContest', { name }, (resp) => {
      if (resp && resp.roomId) {
        joinLocal(resp.roomId, true);
      }
    });
  };

  joinBtn.onclick = () => {
    const roomId = roomIdInput.value && roomIdInput.value.trim();
    if (!roomId) return alert('Enter room id');
    joinLocal(roomId, false);
  };

  function joinLocal(roomId, isHost) {
    const name = nameInput.value || 'Player';
    socket.emit('joinContest', { roomId, name }, (resp) => {
      if (resp && resp.ok) {
        currentRoom = roomId;
        setup.classList.add('hidden');
        lobby.classList.remove('hidden');
        roomLabel.textContent = roomId;
        if (!isHost) startBtn.style.display = 'none';
      } else {
        alert('Could not join: ' + (resp && resp.error ? resp.error : 'unknown'));
      }
    });
  }

  startBtn.onclick = () => {
    if (!currentRoom) return;
    socket.emit('startContest', { roomId: currentRoom }, (resp) => {
      if (!resp || !resp.ok) alert('Could not start: ' + (resp && resp.error));
    });
  };

  leaveBtn.onclick = () => {
    if (!currentRoom) return;
    socket.emit('leaveContest', { roomId: currentRoom }, (resp) => {
      setup.classList.remove('hidden');
      lobby.classList.add('hidden');
      currentRoom = null;
    });
  };

  socket.on('lobbyUpdate', ({ roomId, leaderboard }) => {
    if (!currentRoom) return;
    leaders.innerHTML = '';
    leaderboard.forEach((p, idx) => {
      const li = document.createElement('li');
      let medal = '🥇';
      if (idx === 1) medal = '🥈';
      if (idx === 2) medal = '🥉';
      li.textContent = `${medal} ${p.name} — ${p.score} pts`;
      leaders.appendChild(li);
    });
  });

  socket.on('question', (q) => {
    revealArea.classList.add('hidden');
    questionArea.classList.remove('hidden');
    answerSent = false;
    currentQuestion = q;
    currentQuestionNum++;
    
    questionCounter.textContent = `Question ${currentQuestionNum} of ${totalQuestions}`;
    questionText.textContent = q.text;
    choicesDiv.innerHTML = '';
    
    q.choices.forEach((c, idx) => {
      const btn = document.createElement('button');
      btn.textContent = c;
      btn.onclick = () => submitAnswer(idx, btn);
      choicesDiv.appendChild(btn);
    });
  });

  function submitAnswer(choiceIndex, btn) {
    if (!currentRoom || !currentQuestion || answerSent) return;
    
    socket.emit('answer', { roomId: currentRoom, questionId: currentQuestion.id, choiceIndex }, (resp) => {
      if (resp && resp.ok) {
        answerSent = true;
        // Mark selected answer and disable all
        Array.from(choicesDiv.querySelectorAll('button')).forEach(b => {
          b.disabled = true;
          if (b === btn) {
            b.classList.add('selected');
          }
        });
      } else {
        alert('Could not send answer: ' + (resp && resp.error));
      }
    });
  }

  socket.on('reveal', ({ correctIndex, scored, leaderboard }) => {
    revealArea.classList.remove('hidden');
    questionArea.classList.add('hidden');
    
    const correctBtn = choicesDiv.children[correctIndex];
    const correctAnswer = currentQuestion.choices[correctIndex];
    
    revealText.innerHTML = `<strong>Correct Answer: ${correctAnswer}</strong>`;
    if (scored.length > 0) {
      revealText.innerHTML += `<p style="margin-top: 15px; font-size: 1.05em;">Points scored this round:</p>`;
      scored.forEach(s => {
        revealText.innerHTML += `<p style="color: #fff;">✨ ${s.name}: +${s.points} points</p>`;
      });
    } else {
      revealText.innerHTML += `<p style="margin-top: 15px;">No one answered correctly :(</p>`;
    }
    
    // Update leaderboard
    leaders.innerHTML = '';
    leaderboard.forEach((p, idx) => {
      const li = document.createElement('li');
      let medal = '🥇';
      if (idx === 1) medal = '🥈';
      if (idx === 2) medal = '🥉';
      li.textContent = `${medal} ${p.name} — ${p.score} pts`;
      leaders.appendChild(li);
    });
  });

  socket.on('contestEnded', ({ leaderboard, reason }) => {
    questionArea.classList.add('hidden');
    revealArea.classList.remove('hidden');
    
    revealText.innerHTML = `<h2 style="font-size: 2em; margin-bottom: 20px;">🎉 Contest Finished! 🎉</h2>`;
    revealText.innerHTML += `<p style="font-size: 1.2em; margin-bottom: 30px;">Final Leaderboard:</p>`;
    
    (leaderboard || []).forEach((p, idx) => {
      let medal = '🥇 1st Place';
      if (idx === 1) medal = '🥈 2nd Place';
      if (idx === 2) medal = '🥉 3rd Place';
      if (idx > 2) medal = `${idx + 1}th Place`;
      
      revealText.innerHTML += `<p style="font-size: 1.1em; margin: 10px 0;">${medal}: <strong>${p.name}</strong> — ${p.score} points</p>`;
    });
    
    nextQuestionMsg.textContent = reason ? `(${reason})` : '';
  });
})();
