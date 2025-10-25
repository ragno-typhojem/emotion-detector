import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as faceapi from 'face-api.js';
import './App.css';
import logo from './logo.png';

function App() {
  // Ref'ler
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  // State'ler
  const [currentEmotion, setCurrentEmotion] = useState('');
  const [displayedEmotion, setDisplayedEmotion] = useState('');
  const [loading, setLoading] = useState(true);
  const [emotionHistory, setEmotionHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [recommendation, setRecommendation] = useState('');
  const [isReady, setIsReady] = useState(false);
  const [explosions, setExplosions] = useState([]);
  const [confidenceLevel, setConfidenceLevel] = useState(0);
  const [isStable, setIsStable] = useState(false);

  // Zamanlayıcılar ve ref'ler
  const detectionIntervalRef = useRef(null);
  const lastEmotionChangeRef = useRef(0);
  const emotionBufferRef = useRef([]);
  const stabilityTimerRef = useRef(null);
  const lastDetectionRef = useRef(0);

  // Geliştirilmiş sabitler
  const EMOTION_CHANGE_COOLDOWN = 1100; // 1.5 saniye (daha uzun)
  const DETECTION_INTERVAL = 150; // Biraz daha yavaş
  const BUFFER_SIZE =5; // Daha büyük buffer
  const STABILITY_THRESHOLD = 3; // Kararlılık için gereken aynı duygu sayısı
  const MIN_CONFIDENCE = 0.65; // Daha yüksek güven eşiği
  const STABILITY_TIME = 1100; // 2 saniye kararlı kalma süresi

  // Duygu haritası (aynı)
  const emotionMap = {
    'happy': { emoji: '😄', text: 'Mutlu Gözüküyorsun!', color: '#4CAF50' },
    'sad': { emoji: '😢', text: 'Üzgünsün', color: '#2196F3' },
    'angry': { emoji: '😠', text: 'Sinirlisin', color: '#f44336' },
    'disgusted': { emoji: '🤢', text: 'Miden bulanmış gözüküyorsun', color: '#9C27B0' },
    'fearful': { emoji: '😨', text: 'Korkmuşsun', color: '#FF9800' },
    'neutral': { emoji: '😐', text: 'Sakinsin', color: '#607D8B' },
    'surprised': { emoji: '😮', text: 'Şaşırmış gözüküyorsun', color: '#E91E63' }
  };

  // Öneri sistemi (aynı)
  const recommendations = {
    'happy': ['Bu mutluluğu paylaşmayı unutma! Paylaşmak güzeldir📱', 'Dans et! Hep gülümse 💃', 'Gülümsemeye devam et! Mutlu oldukça herşeyi başarırsın😊', 'Pozitif enerjini yay! Yaydıkça çevren de mutlu olur✨'],
    'sad': ['Derin nefes al 🌸 Üzgünlüğünü paylaşarak atlatırsın😊 ', 'Sevdiğin müziği dinle 🎵 Her zaman iyi tarafından bak', 'Kendine zaman ayır ☕', 'Asla pes etme, çalışırsan üstesinden gelemeyeceğin iş yok 💪'],
    'angry': ['Sakin ol 🧘‍♂️', 'Derin nefes al, bu hayatta hiç bir şeyi öfkeyle çözemeyiz😊', 'Biraz yürüyüş yap 🚶‍♂️ İyi Gelir!', 'Su iç 💧 Su çok sağlıklı olduğu gibi sinirini de azaltır.'],
    'neutral': ['Nasılsın? ✨', 'Normal gözüküyorsun🌸', 'Hep Gülümse 😊'],
    'surprised': ['Bu anı yaşa! ⭐ Şaşırdığını görüyorum!', 'Sanırım yapay zeka olduğuma şaşırdın😊', 'Şaşırmaya devam et! 🎉', 'Merakını koru! 🔍 Merakla araştır, öğrenecek çok şey var!'],
    'disgusted': ['Temiz hava al 🌿 İyi misin?', 'Su iç 💧', 'Rahatlamaya çalış 😌', 'Pozitif düşün pozitif olsun 😊'],
    'fearful': ['Güvendesin 🤗, Korkmana gerek yok 😊', 'Sakin ol 🕊️ Korkma😊', 'Derin nefes al 🌸 Korkunun üstesinden gel💪', 'Cesaretli ol 💪 Asla pes etme ve korkma!']
  };

  const getRandomRecommendation = useCallback((emotionKey) => {
    const recs = recommendations[emotionKey];
    if (!recs || recs.length === 0) return '';
    return recs[Math.floor(Math.random() * recs.length)];
  }, []);

  // Efekt emojileri (aynı)
  const emotionEffects = {
    'happy': ['🌸', '🌺', '🌻', '🌷', '🌹', '💐', '🌼', '🥀', '🌿', '🍀'],
    'sad': ['💧', '☔', '🌧️', '☁️', '💦', '🌊', '😭', '💔', '🥀', '🌫️'],
    'angry': ['🔥', '💥', '⚡', '🌋', '💢', '😡', '🚨', '🔴', '💀', '⭐'],
    'disgusted': ['🤮', '💩', '🦠', '☠️', '🤢', '💚', '🧪', '⚠️', '🚫', '🗑️'],
    'fearful': ['👻', '🕷️', '🦇', '💀', '⚡', '🌩️', '😱', '🔮', '🌙', '⭐'],
    'surprised': ['💥', '⚡', '✨', '💫', '🌟', '🎆', '🎇', '💢', '🤯', '💭']
  };

  // 🎯 Geliştirilmiş duygu kararlılık kontrolü
  const analyzeEmotionStability = useCallback((newEmotion, confidence) => {
    const now = Date.now();

    // Buffer'a yeni duyguyu ekle
    emotionBufferRef.current.push({
      emotion: newEmotion,
      confidence: confidence,
      timestamp: now
    });

    // Buffer boyutunu kontrol et
    if (emotionBufferRef.current.length > BUFFER_SIZE) {
      emotionBufferRef.current.shift();
    }

    // Son 3 saniye içindeki verileri filtrele
    const recentEmotions = emotionBufferRef.current.filter(
      item => now - item.timestamp < 3000
    );

    if (recentEmotions.length < 3) return false;

    // Aynı duygunun kaç kez tekrar ettiğini say
    const emotionCounts = {};
    let totalConfidence = 0;

    recentEmotions.forEach(item => {
      emotionCounts[item.emotion] = (emotionCounts[item.emotion] || 0) + 1;
      totalConfidence += item.confidence;
    });

    const averageConfidence = totalConfidence / recentEmotions.length;
    const mostFrequent = Object.entries(emotionCounts)
      .reduce((a, b) => a[1] > b[1] ? a : b);

    // Kararlılık kriterleri
    const isFrequent = mostFrequent[1] >= STABILITY_THRESHOLD;
    const isConfident = averageConfidence >= MIN_CONFIDENCE;
    const isSameEmotion = mostFrequent[0] === newEmotion;

    return isFrequent && isConfident && isSameEmotion;
  }, []);

  // 🎭 Efekt oluşturma (aynı)
  const createEmotionExplosion = useCallback((emotionKey) => {
    if (emotionKey === 'neutral') return;

    const newExplosions = [];
    const count = 5;
    const emojis = emotionEffects[emotionKey] || ['✨'];

    for (let i = 0; i < count; i++) {
      const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];

      newExplosions.push({
        id: Date.now() + i + Math.random() * 1000,
        emoji: randomEmoji,
        x: Math.random() * 80 + 10,
        y: Math.random() * 80 + 10,
        size: 20 + Math.random() * 16,
        duration: 1200 + Math.random() * 800,
        emotionType: emotionKey
      });
    }

    setExplosions(prev => [...prev, ...newExplosions]);

    setTimeout(() => {
      setExplosions(prev => prev.filter(e =>
        !newExplosions.some(ne => ne.id === e.id)
      ));
    }, 2000);
  }, []);

  // 🧠 Geliştirilmiş yüz tespiti
  const detectFaces = useCallback(async () => {
    if (!videoRef.current || !isReady) return;

    const now = Date.now();
    if (now - lastDetectionRef.current < DETECTION_INTERVAL) return;
    lastDetectionRef.current = now;

    const video = videoRef.current;
    if (video.readyState < 2 || video.videoWidth === 0) return;

    try {
      const detection = await faceapi.detectSingleFace(
        video,
        new faceapi.TinyFaceDetectorOptions({
          inputSize: 224, // Daha yüksek çözünürlük
          scoreThreshold: 0.3 // Daha düşük eşik, daha iyi tespit
        })
      ).withFaceExpressions();

      if (detection && detection.expressions) {
        const expressions = detection.expressions;

        // En baskın 2 duyguyu al ve karşılaştır
        const sortedEmotions = Object.entries(expressions)
          .sort((a, b) => b[1] - a[1]);

        const [dominant, secondary] = sortedEmotions;
        const dominantEmotion = dominant[0];
        const dominantConfidence = dominant[1];
        const secondaryConfidence = secondary ? secondary[1] : 0;

        // Duygu arasındaki fark yeterince büyük mü?
        const confidenceDiff = dominantConfidence - secondaryConfidence;

        // Güven seviyesini güncelle
        setConfidenceLevel(Math.round(dominantConfidence * 100));

        // Yeterli güven ve fark varsa işle
        if (dominantConfidence >= MIN_CONFIDENCE && confidenceDiff >= 0.15) {
          const emotionData = emotionMap[dominantEmotion];
          if (!emotionData) return;

          // Kararlılık analizi
          const isStableEmotion = analyzeEmotionStability(dominantEmotion, dominantConfidence);
          setIsStable(isStableEmotion);

          if (isStableEmotion) {
            const newEmotionText = `${emotionData.emoji} ${emotionData.text}`;

            // Duygu değişikliği kontrolü
            if (currentEmotion !== newEmotionText &&
                now - lastEmotionChangeRef.current > EMOTION_CHANGE_COOLDOWN) {

              setCurrentEmotion(newEmotionText);
              setDisplayedEmotion(newEmotionText);
              lastEmotionChangeRef.current = now;

              // Geçmişe ekle
              setEmotionHistory(prev => [...prev.slice(-9), {
                emotion: newEmotionText,
                timestamp: new Date().toLocaleTimeString('tr-TR', {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit'
                }),
                confidence: Math.round(dominantConfidence * 100),
                stability: '✅ Kararlı'
              }]);

              // Efekt ve öneri
              createEmotionExplosion(dominantEmotion);
              const newAdvice = getRandomRecommendation(dominantEmotion);
              setRecommendation(newAdvice);

              // Kararlılık timer'ını resetle
              if (stabilityTimerRef.current) {
                clearTimeout(stabilityTimerRef.current);
              }

              stabilityTimerRef.current = setTimeout(() => {
                setIsStable(false);
              }, STABILITY_TIME);
            }
          }

          // Canvas çizimi
          if (canvasRef.current) {
            const ctx = canvasRef.current.getContext('2d');
            ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);

            const box = detection.detection.box;

            // Kararlılık durumuna göre renk
            const strokeColor = isStableEmotion ? emotionData.color : '#888888';
            const lineWidth = isStableEmotion ? 3 : 2;

            ctx.strokeStyle = strokeColor;
            ctx.lineWidth = lineWidth;
            ctx.strokeRect(
              canvasRef.current.width - box.x - box.width,
              box.y,
              box.width,
              box.height
            );

            // Güven seviyesi ve kararlılık göstergesi
            ctx.fillStyle = strokeColor;
            ctx.font = 'bold 14px Arial';
            ctx.textAlign = 'center';

            const statusText = isStableEmotion
              ? `✅ %${Math.round(dominantConfidence * 100)}`
              : `⏳ %${Math.round(dominantConfidence * 100)}`;

            ctx.fillText(
              statusText,
              canvasRef.current.width - box.x - box.width/2,
              box.y - 8
            );

            // Alt kısımda duygu adı
            ctx.font = '12px Arial';
            ctx.fillText(
              dominantEmotion.toUpperCase(),
              canvasRef.current.width - box.x - box.width/2,
              box.y + box.height + 15
            );
          }
        } else {
          // Düşük güven durumunda canvas'ı temizle
          if (canvasRef.current) {
            const ctx = canvasRef.current.getContext('2d');
            ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
          }
          setIsStable(false);
        }
      } else {
        // Yüz bulunamadığında
        if (canvasRef.current) {
          const ctx = canvasRef.current.getContext('2d');
          ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        }
        setIsStable(false);
        setConfidenceLevel(0);
      }
    } catch (error) {
      console.warn('Tespit hatası:', error.message);
    }
  }, [isReady, currentEmotion, analyzeEmotionStability, getRandomRecommendation, createEmotionExplosion]);

  // Sistem başlatma (aynı)
  useEffect(() => {
    let isMounted = true;

    const initializeSystem = async () => {
      try {
        setLoading(true);
        setDisplayedEmotion('Sistem başlatılıyor...');

        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri('/models'),
          faceapi.nets.faceExpressionNet.loadFromUri('/models')
        ]);

        if (!isMounted) return;

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: 640,
            height: 480,
            facingMode: 'user',
            frameRate: { ideal: 15, max: 20 }
          }
        });

        if (!isMounted || !videoRef.current) return;

        videoRef.current.srcObject = stream;

        videoRef.current.onloadedmetadata = () => {
          if (!isMounted || !videoRef.current) return;

          videoRef.current.play().then(() => {
            if (canvasRef.current) {
              canvasRef.current.width = videoRef.current.videoWidth;
              canvasRef.current.height = videoRef.current.videoHeight;
            }

            setLoading(false);
            setIsReady(true);

            const initialText = '🎯 Yüzünüzü kameraya gösterin ve sabit tutun';
            setDisplayedEmotion(initialText);
            setCurrentEmotion('🤖 Sistem Hazır');
          });
        };

      } catch (error) {
        if (!isMounted) return;

        setLoading(false);
        if (error.name === 'NotAllowedError') {
          setDisplayedEmotion('❌ Kamera izni gerekli');
          setCurrentEmotion('❌ İzin Gerekli');
        } else {
          setDisplayedEmotion('❌ Kamera açılamadı');
          setCurrentEmotion('❌ Hata');
        }
      }
    };

    initializeSystem();

    return () => {
      isMounted = false;
      if (videoRef.current?.srcObject) {
        videoRef.current.srcObject.getTracks().forEach(track => track.stop());
      }
      if (detectionIntervalRef.current) {
        clearInterval(detectionIntervalRef.current);
      }
      if (stabilityTimerRef.current) {
        clearTimeout(stabilityTimerRef.current);
      }
    };
  }, []);

  // Tespit başlatma
  useEffect(() => {
    if (isReady) {
      if (detectionIntervalRef.current) {
        clearInterval(detectionIntervalRef.current);
      }
      detectionIntervalRef.current = setInterval(detectFaces, DETECTION_INTERVAL);
    }

    return () => {
      if (detectionIntervalRef.current) {
        clearInterval(detectionIntervalRef.current);
      }
    };
  }, [isReady, detectFaces]);

  // 🎯 Geçmişi temizleme fonksiyonu
  const clearHistory = useCallback(() => {
    setEmotionHistory([]);
    emotionBufferRef.current = [];
    setCurrentEmotion('🤖 Geçmiş Temizlendi');
    setDisplayedEmotion('Yeni tespit için yüzünüzü gösterin');
    setRecommendation('');
  }, []);

  return (
    <div className="container">
      <div className="detector-area">
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          width="720"
          height="560"
          style={{ transform: 'scaleX(-1)' }}
        />
        <canvas
          ref={canvasRef}
          className="overlay"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            pointerEvents: 'none'
          }}
        />

        <div className="emotion-display">
          {displayedEmotion}
          {/* 🎯 Kararlılık ve güven göstergesi */}
          {isReady && (
            <div className="detection-status">
              <div className={`stability-indicator ${isStable ? 'stable' : 'unstable'}`}>
                {isStable ? '✅ Kararlı' : '⏳ Analiz ediliyor...'}
              </div>
              <div className="confidence-bar">
                <div
                  className="confidence-fill"
                  style={{
                    width: `${confidenceLevel}%`,
                    backgroundColor: confidenceLevel >= MIN_CONFIDENCE * 100 ? '#4CAF50' : '#ff9800'
                  }}
                ></div>
                <span className="confidence-text">Güven: %{confidenceLevel}</span>
              </div>
            </div>
          )}
        </div>

        {loading && (
          <div className="loading">
            <div className="spinner"></div>
            Sistem başlatılıyor...
          </div>
        )}

        {/* Efektler (aynı) */}
        <div className="explosion-container">
          {explosions.map((explosion) => (
            <div
              key={explosion.id}
              className="explosion-emoji"
              style={{
                left: `${explosion.x}%`,
                top: `${explosion.y}%`,
                fontSize: `${explosion.size}px`,
                animationDuration: `${explosion.duration}ms`,
                animationName: explosion.emotionType === 'angry' ? 'fireExplode' :
                              explosion.emotionType === 'happy' ? 'flowerBloom' :
                              explosion.emotionType === 'sad' ? 'rainDrop' :
                              explosion.emotionType === 'fearful' ? 'ghostFloat' :
                              explosion.emotionType === 'surprised' ? 'sparkExplode' :
                              'explode',
                filter: explosion.emotionType === 'angry' ? 'hue-rotate(0deg) brightness(1.2)' :
                       explosion.emotionType === 'happy' ? 'hue-rotate(60deg) brightness(1.1)' :
                       explosion.emotionType === 'sad' ? 'hue-rotate(240deg) brightness(0.8)' :
                       explosion.emotionType === 'fearful' ? 'hue-rotate(280deg) brightness(0.7)' :
                       explosion.emotionType === 'surprised' ? 'hue-rotate(320deg) brightness(1.3)' :
                       'none'
              }}
            >
              {explosion.emoji}
            </div>
          ))}
        </div>
      </div>

      <div className="fun-section">
        <div className="header">
          <img src={logo} alt="Logo" className="logo" />
          <h2>🧠 Duygu Dedektörü v2.0</h2>
        </div>

        <div className="current-emotion">
          <div className="big-emoji">
            {currentEmotion.split(' ')[0] || '🤖'}
          </div>
          <p className="emotion-label">
            {currentEmotion.split(' ').slice(1).join(' ') || 'Sistem Hazır'}
          </p>
          {/* 🎯 Geliştirilmiş durum göstergesi */}
          {isReady && (
            <div className="emotion-meta">
              <span className={`status-badge ${isStable ? 'stable' : 'analyzing'}`}>
                {isStable ? '🎯 Tespit Edildi' : '🔍 Analiz Ediliyor'}
              </span>
            </div>
          )}
        </div>

        <div className="recommendation">
          <h4>💡 AI Tavsiyesi</h4>
          <p>{recommendation || 'Kararlı bir duygu tespit edildiğinde tavsiye gösterilecek'}</p>
        </div>

        <div className="controls">
          <button
            className="btn primary"
            onClick={() => setShowHistory(!showHistory)}
          >
            {showHistory ? '🧠 Ana Ekran' : '📊 Duygu Geçmişi'}
          </button>

          {emotionHistory.length > 0 && (
            <button
              className="btn secondary"
              onClick={clearHistory}
            >
              🗑️ Geçmişi Temizle
            </button>
          )}
        </div>

        {showHistory && (
          <div className="history-section">
            <h4>📈 Tespit Geçmişi ({emotionHistory.length})</h4>
            {emotionHistory.length > 0 ? (
              <div className="history-grid">
                {emotionHistory.map((item, index) => (
                  <div key={index} className="history-card">
                    <span className="emotion">{item.emotion}</span>
                    <div className="meta">
                      <span className="time">{item.timestamp}</span>
                      <span className="confidence">%{item.confidence}</span>
                      <span className="stability">{item.stability}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="no-data">Henüz kararlı duygu kaydı yok</p>
            )}
          </div>
        )}

        <div className="system-info">
          <h4>⚙️ Sistem Durumu</h4>
          <div className="info-grid">
            <div className="info-item">
              <span className="label">Tespit Hızı:</span>
              <span className="value">{DETECTION_INTERVAL}ms</span>
            </div>
            <div className="info-item">
              <span className="label">Min. Güven:</span>
              <span className="value">%{MIN_CONFIDENCE * 100}</span>
            </div>
            <div className="info-item">
              <span className="label">Kararlılık:</span>
              <span className="value">{STABILITY_THRESHOLD} tespit</span>
            </div>
            <div className="info-item">
              <span className="label">Buffer Boyutu:</span>
              <span className="value">{emotionBufferRef.current.length}/{BUFFER_SIZE}</span>
            </div>
          </div>
        </div>

        <div className="footer">
          <p>🤖 AI Duygu Analizi v2.0 - Geliştirilmiş Kararlılık</p>
          <p>
            <a
              href="https://ilkyar.org.tr/"
              target="_blank"
              rel="noopener noreferrer"
              className="ilkyar-link"
              style={{
                fontFamily: "'Comic Sans MS', 'Comic Sans', 'Chilanka', cursive, sans-serif",
                fontSize: '1.2em',
                color: '#ff69b4',
                fontWeight: 'bold',
                letterSpacing: '0px',
                padding: '0.01em 0.4em',
              }}
            >
              İLKYAR
            </a>
            projelerinde kullanılmak üzere geliştirilmiştir. Açık kaynaktır.
          </p>
          <p>
            Geliştiriciye hata bildir{' '}
            <a href="mailto:simseklermustafaberke@gmail.com" target="_blank" rel="noopener noreferrer">
              EMAIL GÖNDER
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

export default App;
