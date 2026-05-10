import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import './index.css';

import english1k from './assets/languages/english_1k.json';
import vietnamese1k from './assets/languages/vietnamese_1k.json';

const WORD_LISTS = {
  en: english1k.words,
  vi: vietnamese1k.words
};
// Project configuration
const TEST_DURATION = 60;

function App() {
  const [lang, setLang] = useState('en');
  const [words, setWords] = useState([]);
  const [currentWordIdx, setCurrentWordIdx] = useState(0);
  const [inputValue, setInputValue] = useState('');
  const [userInputStatus, setUserInputStatus] = useState([]);
  const [timeLeft, setTimeLeft] = useState(TEST_DURATION);
  const [isActive, setIsActive] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [stats, setStats] = useState({ wpm: 0, accuracy: 100, correctChars: 0, totalTyped: 0 });
  const [wpmHistory, setWpmHistory] = useState([]);

  const [currentKeystrokes, setCurrentKeystrokes] = useState([]);
  const [secErrors, setSecErrors] = useState(0);
  const [secMods, setSecMods] = useState(0);

  const inputRef = useRef(null);
  const timerRef = useRef(null);
  const caretRef = useRef(null);
  const wordsContainerRef = useRef(null);
  const isComposing = useRef(false);
  const lineHeightRef = useRef(0);

  // Web Audio API logic
  const audioCtx = useRef(null);
  const audioBuffers = useRef({});

  useEffect(() => {
    audioCtx.current = new (window.AudioContext || window.webkitAudioContext)();

    // Load sounds từ thư mục public/sound/
    const soundKeys = ['backspace', ...'abcdefghijklmnopqrstuvwxyz'.split('')];
    soundKeys.forEach(key => {
      fetch(`/sound/${key}.mp3`)
        .then(res => {
          if (!res.ok) throw new Error(`Not found: ${key}`);
          return res.arrayBuffer();
        })
        .then(data => audioCtx.current.decodeAudioData(data))
        .then(buffer => { audioBuffers.current[key] = buffer; })
        .catch(e => console.warn("Audio Load Warning:", key, e));
    });

    generateWords();
  }, []);

  useEffect(() => {
    generateWords();
  }, [lang]);

  useEffect(() => { lineHeightRef.current = 0; }, [words]);

  const generateWords = () => {
    const list = WORD_LISTS[lang];
    const randomWords = Array.from({ length: 200 }, () => list[Math.floor(Math.random() * list.length)]);
    setWords(randomWords);
    resetTest(false);
  };

  const resetTest = (regen = false) => {
    setCurrentWordIdx(0);
    setInputValue('');
    setUserInputStatus([]);
    setTimeLeft(TEST_DURATION);
    setIsActive(false);
    setShowResult(false);
    setStats({ wpm: 0, accuracy: 100, correctChars: 0, totalTyped: 0 });
    setWpmHistory([]);
    setCurrentKeystrokes([]);
    setSecErrors(0);
    setSecMods(0);
    clearInterval(timerRef.current);
    if (regen) {
      const list = WORD_LISTS[lang];
      const randomWords = Array.from({ length: 200 }, () => list[Math.floor(Math.random() * list.length)]);
      setWords(randomWords);
    }
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const startTimer = () => {
    setIsActive(true);
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          endTest();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const endTest = () => {
    clearInterval(timerRef.current);
    setIsActive(false);
    setShowResult(true);
  };

  const playClick = (key) => {
    if (!audioCtx.current) return;
    if (audioCtx.current.state === 'suspended') audioCtx.current.resume();
    if (!key) return;
    const lowerKey = key.toLowerCase();
    let buffer = null;
    if (lowerKey === 'backspace') {
      buffer = audioBuffers.current['backspace'];
    } else if (audioBuffers.current[lowerKey]) {
      buffer = audioBuffers.current[lowerKey];
    } else {
      buffer = audioBuffers.current['a'];
    }
    if (!buffer) return;
    const source = audioCtx.current.createBufferSource();
    source.buffer = buffer;
    const gainNode = audioCtx.current.createGain();
    gainNode.gain.value = 0.5;
    source.connect(gainNode);
    gainNode.connect(audioCtx.current.destination);
    source.start(0);
  };

  const handleCompositionStart = () => { isComposing.current = true; };
  const handleCompositionEnd = (e) => { isComposing.current = false; handleInputChange(e); };

  const handleInputChange = (e) => {
    if (showResult) return;
    if (!isActive && e.target.value.length > 0) startTimer();

    const val = e.target.value;
    const targetWord = words[currentWordIdx];

    if (val.endsWith(' ') && !isComposing.current) {
      const typedWord = val.trim();
      if (!typedWord) return;
      const isCorrect = typedWord === targetWord;
      setUserInputStatus(prev => [...prev, { word: typedWord, status: isCorrect ? 'correct' : 'incorrect', keystrokes: currentKeystrokes.join('') }]);
      let correctInWord = 0;
      for (let i = 0; i < Math.min(typedWord.length, targetWord.length); i++) {
        if (typedWord[i] === targetWord[i]) correctInWord++;
      }
      setStats(prev => ({ ...prev, correctChars: prev.correctChars + (isCorrect ? targetWord.length + 1 : correctInWord), totalTyped: prev.totalTyped + val.length }));
      setCurrentWordIdx(prev => prev + 1);
      setInputValue('');
      setCurrentKeystrokes([]);
    } else {
      setInputValue(val);
      if (isComposing.current) return;
      if (val.length < inputValue.length) {
        playClick('backspace');
        setCurrentKeystrokes(prev => [...prev, '[del]']);
        setSecMods(prev => prev + 1);
      } else {
        const lastChar = val[val.length - 1];
        playClick(lastChar);
        if (lastChar !== ' ') {
          setCurrentKeystrokes(prev => [...prev, lastChar]);
          const charIdx = val.length - 1;
          if (charIdx >= targetWord.length || lastChar !== targetWord[charIdx]) {
            setSecErrors(prev => prev + 1);
          }
        }
      }
      if (val.length > inputValue.length) {
        setStats(prev => ({ ...prev, totalTyped: prev.totalTyped + 1 }));
        if (targetWord && val[val.length - 1] === targetWord[val.length - 1]) {
          setStats(prev => ({ ...prev, correctChars: prev.correctChars + 1 }));
        }
      }
    }
  };

  useLayoutEffect(() => {
    if (!wordsContainerRef.current || !caretRef.current) return;
    const wordEls = Array.from(wordsContainerRef.current.children).slice(1); // bỏ qua caret
    const currentWordEl = wordEls[currentWordIdx];
    if (!currentWordEl) return;

    const letters = currentWordEl.querySelectorAll('.letter');
    const currentLetterIdx = inputValue.length;
    const targetEl = currentLetterIdx < letters.length
      ? letters[currentLetterIdx]
      : letters[letters.length - 1];
    if (!targetEl) return;

    let left = currentWordEl.offsetLeft + targetEl.offsetLeft;
    if (currentLetterIdx >= letters.length) left += targetEl.offsetWidth;
    const top = currentWordEl.offsetTop + targetEl.offsetTop;

    // Scroll: đặt scrollTop = offsetTop của word hiện tại so với word đầu tiên
    // → dòng hiện tại luôn nằm ở đầu vùng hiển thị, dòng tiếp theo hiện bên dưới
    const baseTop = wordEls[0]?.offsetTop ?? 0;
    const scrollTop = Math.max(0, currentWordEl.offsetTop - baseTop);
    wordsContainerRef.current.scrollTop = scrollTop;

    // Caret: tính toán vị trí trừ đi scrollTop để caret đứng đúng chỗ
    caretRef.current.style.transform = `translate(${left - 4}px, ${top - scrollTop + 8}px)`;
  }, [currentWordIdx, inputValue, words]);

  useEffect(() => {
    if (isActive) {
      const elapsedSeconds = TEST_DURATION - timeLeft;
      const elapsedMinutes = elapsedSeconds / 60;
      const wpm = Math.round((stats.correctChars / 5) / (elapsedMinutes || 0.01));
      const acc = stats.totalTyped > 0 ? Math.round((stats.correctChars / stats.totalTyped) * 100) : 100;
      setStats(prev => ({ ...prev, wpm, accuracy: acc }));
      setWpmHistory(prev => [...prev, { time: elapsedSeconds, wpm, errors: secErrors > 0 ? wpm : null, mods: secMods > 0 ? wpm : null, word: words[currentWordIdx], keystrokes: currentKeystrokes.join('') }]);
      setSecErrors(0);
      setSecMods(0);
    }
  }, [timeLeft]);

  const handleLangChange = (newLang) => { setLang(newLang); };

  return (
    <div
      className="app-wrapper"
      onClick={() => { inputRef.current?.focus(); if (audioCtx.current?.state === 'suspended') audioCtx.current.resume(); }}
    >
      {/* Ticker chạy ngang — nằm trên cùng */}
      <div className="running-text-container">
        <div className="running-text">
          &nbsp;&nbsp;&nbsp;Đây cũng là một web làm khi rảnh háng... &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Nếu bạn đọc đến đây rồi thì bạn mất thêm 10s cuộc đời rồi á :3 Cheeeeseeee~&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
        </div>
      </div>

      {/* Header sticky */}
      <div className="header">
        <div className="logo">tap.dii</div>

        <div className="stats-container">
          <div className="stat-item"><span className="stat-label">Time</span><span className="stat-value">{timeLeft}</span></div>
          <div className="stat-item"><span className="stat-label">WPM</span><span className="stat-value">{stats.wpm}</span></div>
          <div className="stat-item"><span className="stat-label">Acc</span><span className="stat-value">{stats.accuracy}%</span></div>
        </div>

        <div className="controls-right">
          <select
            id="lang-select"
            className="lang-select"
            value={lang}
            onChange={(e) => { handleLangChange(e.target.value); }}
            onClick={(e) => e.stopPropagation()}
          >
            <option value="en">English</option>
            <option value="vi">Tiếng Việt</option>
          </select>
        </div>
      </div>

      {/* Nội dung chính */}
      <div className="content-wrapper">
        {!showResult ? (
          <>
            <div className="audio-hint">Click to start typing</div>

            <div className="typing-area-wrapper">
              <div className="word-display" ref={wordsContainerRef}>
                <div className="caret" ref={caretRef}></div>
                {words.map((word, wIdx) => {
                  let wordStatus = '';
                  if (wIdx < currentWordIdx) wordStatus = userInputStatus[wIdx]?.status;
                  const finalTyped = wIdx < currentWordIdx ? (userInputStatus[wIdx]?.word || '') : (wIdx === currentWordIdx ? inputValue : '');
                  return (
                    <div key={wIdx} className={`word ${wIdx === currentWordIdx ? 'active' : ''} ${wordStatus}`}>
                      {word.split('').map((char, cIdx) => {
                        let status = '';
                        if (wIdx === currentWordIdx && cIdx < inputValue.length) {
                          status = inputValue[cIdx] === char ? 'correct' : 'incorrect';
                        } else if (wIdx < currentWordIdx && cIdx < finalTyped.length) {
                          status = finalTyped[cIdx] === char ? 'correct' : 'incorrect';
                        }
                        return <span key={cIdx} className="letter" data-status={status}>{char}</span>;
                      })}
                      {finalTyped.length > word.length &&
                        finalTyped.slice(word.length).split('').map((char, eIdx) => (
                          <span key={eIdx} className="letter extra">{char}</span>
                        ))
                      }
                    </div>
                  );
                })}
              </div>
              <input
                ref={inputRef}
                type="text"
                className="input-area"
                value={inputValue}
                onChange={handleInputChange}
                onCompositionStart={handleCompositionStart}
                onCompositionEnd={handleCompositionEnd}
                autoFocus
              />
            </div>
          </>
        ) : (
          <div className="result-modal">
            <h2>Result</h2>
            <div className="chart-container">
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={wpmHistory}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#444" vertical={false} />
                  <XAxis dataKey="time" hide />
                  <YAxis stroke="#6c7086" domain={['auto', 'auto']} />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="custom-tooltip" style={{ backgroundColor: '#1e1e2e', padding: '10px', border: '1px solid #444' }}>
                            <p className="tooltip-wpm">{data.wpm} WPM</p>
                            {data.word && <p className="tooltip-word">Word: {data.word}</p>}
                            {data.keystrokes && <p className="tooltip-keys">Typed: {data.keystrokes}</p>}
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Line type="monotone" dataKey="wpm" stroke="#f9e2af" strokeWidth={3} dot={false} isAnimationActive={false} />
                  <Line type="monotone" dataKey="errors" stroke="#f38ba8" strokeWidth={0} dot={{ r: 5, fill: '#f38ba8' }} />
                  <Line type="monotone" dataKey="mods" stroke="#a6e3a1" strokeWidth={0} dot={{ r: 5, fill: '#a6e3a1' }} />
                </LineChart>
              </ResponsiveContainer>
              <div className="chart-legend">
                <span style={{ color: '#f9e2af', marginRight: '10px' }}>— WPM</span>
                <span style={{ color: '#f38ba8', marginRight: '10px' }}>● ERROR</span>
                <span style={{ color: '#a6e3a1' }}>● MODIFICATION</span>
              </div>
            </div>
            <div className="final-stats">
              <div className="stat-item"><span className="stat-label">WPM</span><span className="stat-value">{stats.wpm}</span></div>
              <div className="stat-item"><span className="stat-label">ACC</span><span className="stat-value">{stats.accuracy}%</span></div>
            </div>
            <div className="word-history-container">
              <h3>Word Breakdown</h3>
              <div className="word-history-list">
                {userInputStatus.map((item, idx) => (
                  <span key={idx} className={`history-word ${item.status}`}>
                    {item.keystrokes.replace(/\[del\]/g, '⌫')}
                  </span>
                ))}
              </div>
            </div>
            <div className="restart-btn-wrapper">
              <button id="btn-restart" className="btn-retro btn-restart" onClick={() => resetTest(true)}>Restart Test</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
