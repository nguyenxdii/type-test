import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import './index.css';

const WORD_LISTS = {
  en: ["the", "be", "to", "of", "and", "a", "in", "that", "have", "i", "it", "for", "not", "on", "with", "he", "as", "you", "do", "at", "this", "but", "his", "by", "from", "they", "we", "say", "her", "she", "or", "an", "will", "my", "one", "all", "would", "there", "their", "what", "so", "up", "out", "if", "about", "who", "get", "which", "go", "me", "when", "make", "can", "like", "time", "no", "just", "him", "know", "take", "person", "into", "year", "your", "good", "some", "could", "them", "see", "other", "than", "then", "now", "look", "only", "come", "its", "over", "think", "also", "back", "after", "use", "two", "how", "our", "work", "first", "well", "even", "new", "want", "because", "any", "these", "give", "day", "most", "us"],
  vi: ["anh", "em", "người", "những", "một", "có", "là", "và", "được", "trong", "đến", "cho", "để", "không", "với", "về", "của", "tôi", "ông", "bà", "này", "khi", "như", "đã", "lại", "thấy", "làm", "biết", "nhiều", "nào", "chỉ", "vào", "còn", "thế", "nên", "phải", "đi", "nói", "hết", "cũng", "theo", "mới", "ngày", "nhà", "nơi", "việc", "con", "mình", "cách", "rất", "thời", "gian", "đang", "qua", "trước", "sau", "từ", "nếu", "bởi", "vì", "chưa", "luôn", "xong", "rồi", "đâu", "đấy", "kia", "một", "ít", "đôi", "mọi", "tất", "cả", "thật", "quá", "lắm"]
};

const TEST_DURATION = 30;

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
  
  // Web Audio API logic
  const audioCtx = useRef(null);
  const audioBuffers = useRef({});

  useEffect(() => {
    audioCtx.current = new (window.AudioContext || window.webkitAudioContext)();
    
    // Load all mp3 files from assets/sound
    const soundModules = import.meta.glob('./assets/sound/*.mp3', { eager: true, as: 'url' });
    Object.entries(soundModules).forEach(([path, url]) => {
      const keyMatch = path.match(/\/([^/]+)\.mp3$/);
      if (keyMatch) {
        const key = keyMatch[1];
        fetch(url)
          .then(res => res.arrayBuffer())
          .then(data => audioCtx.current.decodeAudioData(data))
          .then(buffer => { audioBuffers.current[key] = buffer; })
          .catch(e => console.error("Audio Load Error:", key, e));
      }
    });

    generateWords();
  }, []);

  useEffect(() => {
    generateWords();
  }, [lang]);

  const generateWords = () => {
    const list = WORD_LISTS[lang];
    const randomWords = Array.from({ length: 150 }, () => list[Math.floor(Math.random() * list.length)]);
    setWords(randomWords);
    resetTest();
  };

  const resetTest = () => {
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
    } else if (lowerKey === ' ') {
      // Spacebar sound fallback
      buffer = audioBuffers.current['a'];
    } else if (audioBuffers.current[lowerKey]) {
      buffer = audioBuffers.current[lowerKey];
    } else {
      buffer = audioBuffers.current['a']; // Generic fallback
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

  const handleInputChange = (e) => {
    if (showResult) return;
    
    if (!isActive && e.target.value.length > 0) {
      startTimer();
    }

    const val = e.target.value;
    const targetWord = words[currentWordIdx];
    
    // Play correct sound
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
    
    if (val.endsWith(' ')) {
      const typedWord = val.trim();
      if (!typedWord) return;

      const isCorrect = typedWord === targetWord;
      
      setUserInputStatus(prev => [...prev, { 
          word: typedWord, 
          status: isCorrect ? 'correct' : 'incorrect',
          keystrokes: currentKeystrokes.join('')
      }]);
      
      let correctInWord = 0;
      for(let i=0; i < Math.min(typedWord.length, targetWord.length); i++) {
        if (typedWord[i] === targetWord[i]) correctInWord++;
      }

      setStats(prev => ({
        ...prev,
        correctChars: prev.correctChars + (isCorrect ? targetWord.length + 1 : correctInWord),
        totalTyped: prev.totalTyped + val.length
      }));

      setCurrentWordIdx(prev => prev + 1);
      setInputValue('');
      setCurrentKeystrokes([]);
    } else {
      setInputValue(val);
      if (val.length > inputValue.length) {
          setStats(prev => ({ ...prev, totalTyped: prev.totalTyped + 1 }));
          if (targetWord && val[val.length-1] === targetWord[val.length-1]) {
              setStats(prev => ({ ...prev, correctChars: prev.correctChars + 1 }));
          }
      }
    }
  };

  useLayoutEffect(() => {
    if (!wordsContainerRef.current || !caretRef.current) return;
    
    // The caret is now the first child (index 0), so we offset word index by 1
    const currentWordEl = wordsContainerRef.current.children[currentWordIdx + 1];
    if (!currentWordEl) return;

    const currentLetterIdx = inputValue.length;
    // Get letters within the word div
    const letters = currentWordEl.querySelectorAll('.letter');
    let targetEl = currentLetterIdx < letters.length ? letters[currentLetterIdx] : letters[letters.length - 1];
    
    if (targetEl) {
        let left = currentWordEl.offsetLeft + targetEl.offsetLeft;
        if (currentLetterIdx >= letters.length) left += targetEl.offsetWidth;
        
        // Offset top calculation: targetEl.offsetTop is relative to currentWordEl
        const top = currentWordEl.offsetTop + targetEl.offsetTop;
        
        // Position the caret
        caretRef.current.style.transform = `translate(${left - 4}px, ${top + 8}px)`;
        
        // Flawless scrolling: translate by exactly the word's Y position.
        // This ensures the active line is always exactly at the top of the 2-line view.
        const wordTop = currentWordEl.offsetTop;
        wordsContainerRef.current.style.transform = `translateY(-${wordTop}px)`;
    }
  }, [currentWordIdx, inputValue, words]);

  useEffect(() => {
    if (isActive) {
      const elapsedSeconds = TEST_DURATION - timeLeft;
      const elapsedMinutes = elapsedSeconds / 60;
      const wpm = Math.round((stats.correctChars / 5) / (elapsedMinutes || 0.01));
      const acc = stats.totalTyped > 0 ? Math.round((stats.correctChars / stats.totalTyped) * 100) : 100;
      
      setStats(prev => ({ ...prev, wpm, accuracy: acc }));
      setWpmHistory(prev => [...prev, { 
        time: elapsedSeconds, 
        wpm,
        errors: secErrors > 0 ? wpm : null,
        mods: secMods > 0 ? wpm : null,
        word: words[currentWordIdx],
        keystrokes: currentKeystrokes.join('')
      }]);
      setSecErrors(0);
      setSecMods(0);
    }
  }, [timeLeft]);

  return (
    <div className="app-wrapper" onClick={() => { inputRef.current?.focus(); if (audioCtx.current?.state === 'suspended') audioCtx.current.resume(); }}>
      <div className="running-text-container">
        <div className="running-text">
          Đây cũng là một web làm khi rảnh háng... Nếu bạn đọc đến đây rồi thì bạn mất thêm 10s cuộc đời rồi á :3 Cheeeeseeee~
        </div>
      </div>

      <div className="header">
        <div className="logo">tap.dii</div>
        
        <div className="stats-container">
          <div className="stat-item"><span className="stat-label">Time</span><span className="stat-value">{timeLeft}</span></div>
          <div className="stat-item"><span className="stat-label">WPM</span><span className="stat-value">{stats.wpm}</span></div>
          <div className="stat-item"><span className="stat-label">Acc</span><span className="stat-value">{stats.accuracy}%</span></div>
        </div>

        <div className="lang-toggle">
          <button className={`btn-retro ${lang === 'en' ? 'active' : ''}`} onClick={(e) => { e.stopPropagation(); setLang('en'); }}>EN</button>
          <button className={`btn-retro ${lang === 'vi' ? 'active' : ''}`} onClick={(e) => { e.stopPropagation(); setLang('vi'); }}>VN</button>
        </div>
      </div>

      <div className="audio-hint">Click the screen to unlock sound & focus</div>

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
        <input ref={inputRef} type="text" className="input-area" value={inputValue} onChange={handleInputChange} autoFocus />
      </div>

      {showResult && (
        <div className="result-overlay">
          <div className="result-modal">
            <h2>Result</h2>
            <div className="chart-container">
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={wpmHistory}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#444" vertical={false} />
                  <XAxis dataKey="time" hide />
                  <YAxis stroke="#6c7086" domain={['auto', 'auto']} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1e1e2e', border: 'none', color: '#cdd6f4', fontFamily: 'VT323' }}
                    labelFormatter={(label) => `Time: ${label}s`}
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
                <span style={{color: '#f9e2af', marginRight: '10px'}}>— WPM</span>
                <span style={{color: '#f38ba8', marginRight: '10px'}}>● ERROR</span>
                <span style={{color: '#a6e3a1'}}>● MODIFICATION</span>
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
                    {item.keystrokes}
                  </span>
                ))}
              </div>
            </div>
            <button className="btn-retro" onClick={resetTest}>Restart Test</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
