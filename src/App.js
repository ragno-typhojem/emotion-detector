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

  // Zamanlayıcılar
  const detectionIntervalRef = useRef(null);
  const lastEmotionChangeRef = useRef(0);
  const lastEmotionTypeRef = useRef('');

  // Sabitler
  const EMOTION_CHANGE_COOLDOWN = 1000;
  const DETECTION_INTERVAL = 40;

  // Duygu haritası
  const emotionMap = {
    'happy': { emoji: '😄', text: 'Mutlu Gözüküyorsun!', color: '#4CAF50' },
    'sad': { emoji: '😢', text: 'Üzgünsün', color: '#2196F3' },
    'angry': { emoji: '😠', text: 'Sinirlisin', color: '#f44336' },
    'disgusted': { emoji: '🤢', text: 'Miden bulanmış gözüküyorsun', color: '#9C27B0' },
    'fearful': { emoji: '😨', text: 'Korkmuşsun', color: '#FF9800' },
    'neutral': { emoji: '😐', text: 'Sakinsin', color: '#607D8B' },
    'surprised': { emoji: '😮', text: 'Şaşırmış gözüküyorsun', color: '#E91E63' }
  };

  // ÖNERİLER - SADECE DUYGU BAZLI
  const recommendations = {
    'happy': ['Bu mutluluğu paylaşmayı unutma! Paylaşmak güzeldir📱', 'Dans et! Hep gülümse 💃', 'Gülümsemeye devam et! Mutlu oldukça herşeyi başarırsın😊', 'Pozitif enerjini yay! Yaydıkça çevren de mutlu olur✨'],
    'sad': ['Derin nefes al 🌸 Üzgünlüğünü paylaşarak atlatırsın😊 ', 'Sevdiğin müziği dinle 🎵 Her zaman iyi tarafından bak', 'Kendine zaman ayır ☕', 'Asla pes etme, çalışırsan üstesinden gelemeyeceğin iş yok 💪'],
    'angry': ['Sakin ol 🧘‍♂️', 'Derin nefes al, bu hayatta hiç bir şeyi öfkeyle çözemeyiz😊', 'Biraz yürüyüş yap 🚶‍♂️ İyi Gelir!', 'Su iç 💧 Su çok sağlıklı olduğu gibi sinirini de azaltır.'],
    'neutral': ['Nasılsın? ✨', 'Normal gözüküyorsun🌸', 'Hep Gülümse 😊'],
    'surprised': ['Bu anı yaşa! ⭐ Şaşırdığını görüyorum!', 'Sanırım yapay zeka olduğuma şaşırdın😊', 'Şaşırmaya devam et! 🎉', 'Merakını koru! 🔍 Merakla araştır, öğrenecek çok şey var!'],
    'disgusted': ['Temiz hava al 🌿 İyi misin?', 'Su iç 💧', 'Rahatlamaya çalış 😌', 'Pozitif düşün pozitif olsun 😊'],
    'fearful': ['Güvendesin 🤗, Korkmana gerek yok 😊', 'Sakin ol 🕊️ Korkma😊', 'Derin nefes al 🌸 Korkunun üstesinden gel💪', 'Cesaretli ol 💪 Asla pes etme ve korkma!']
  };

  // Rastgele öneri al
  const getRandomRecommendation = useCallback((emotionKey) => {
    const recs = recommendations[emotionKey];
    if (!recs || recs.length === 0) return '';
    return recs[Math.floor(Math.random() * recs.length)];
  }, []);

  // Yüz tespiti fonksiyonu
  const detectFaces = useCallback(async () => {
    if (!videoRef.current || !isReady) {
      return;
    }

    const video = videoRef.current;

    // Video hazır değilse bekle
    if (video.readyState < 2 || video.videoWidth === 0) {
      return;
    }

    try {
      const detection = await faceapi.detectSingleFace(
        video,
        new faceapi.TinyFaceDetectorOptions({
          inputSize: 320,
          scoreThreshold: 0.4
        })
      ).withFaceExpressions();

      if (detection && detection.expressions) {
        const expressions = detection.expressions;
        const dominant = Object.entries(expressions)
          .reduce((a, b) => a[1] > b[1] ? a : b)[0];

        const confidence = expressions[dominant];

        if (confidence > 0.55) {
          const emotionData = emotionMap[dominant];
          if (!emotionData) return;

          const newEmotionText = `${emotionData.emoji} ${emotionData.text}`;
          const now = Date.now();

          // Duygu değişimi kontrolü
          if (currentEmotion !== newEmotionText &&
              now - lastEmotionChangeRef.current > EMOTION_CHANGE_COOLDOWN) {

            // HER İKİ STATE'İ DE AYNI ANDA GÜNCELLE
            setCurrentEmotion(newEmotionText);
            setDisplayedEmotion(newEmotionText);
            lastEmotionChangeRef.current = now;

            // Geçmişe ekle
            setEmotionHistory(prev => [...prev.slice(-7), {
              emotion: newEmotionText,
              timestamp: new Date().toLocaleTimeString('tr-TR', {
                hour: '2-digit',
                minute: '2-digit'
              }),
              confidence: Math.round(confidence * 100)
            }]);

            // ÖNERİ SADECE DUYGU TÜRÜ DEĞİŞTİĞİNDE VER
            if (lastEmotionTypeRef.current !== dominant) {
              const newAdvice = getRandomRecommendation(dominant);
              setRecommendation(newAdvice);
              lastEmotionTypeRef.current = dominant;
            }
          }

          // Canvas çizimi
          if (canvasRef.current) {
            const ctx = canvasRef.current.getContext('2d');
            ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);

            const box = detection.detection.box;
            ctx.strokeStyle = emotionData.color;
            ctx.lineWidth = 2;
            ctx.strokeRect(
              canvasRef.current.width - box.x - box.width,
              box.y,
              box.width,
              box.height
            );

            ctx.fillStyle = emotionData.color;
            ctx.font = '12px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(
              `%${Math.round(confidence * 100)}`,
              canvasRef.current.width - box.x - box.width/2,
              box.y - 5
            );
          }
        }
      } else {
        // Yüz yok, canvas temizle
        if (canvasRef.current) {
          const ctx = canvasRef.current.getContext('2d');
          ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        }
      }
    } catch (error) {
      // Sessiz hata
    }
  }, [isReady, currentEmotion, getRandomRecommendation]);

  // Sistem başlatma
  useEffect(() => {
    let isMounted = true;

    const initializeSystem = async () => {
      try {
        setLoading(true);
        setDisplayedEmotion('Sistem başlatılıyor...');

        // Modelleri yükle
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri('/models'),
          faceapi.nets.faceExpressionNet.loadFromUri('/models')
        ]);

        if (!isMounted) return;

        // Basit kamera ayarları
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: 720,
            height: 560,
            facingMode: 'user'
          }
        });

        if (!isMounted || !videoRef.current) return;

        videoRef.current.srcObject = stream;

        // Video hazır olduğunda
        videoRef.current.onloadedmetadata = () => {
          if (!isMounted || !videoRef.current) return;

          videoRef.current.play().then(() => {
            // Canvas ayarla
            if (canvasRef.current) {
              canvasRef.current.width = videoRef.current.videoWidth;
              canvasRef.current.height = videoRef.current.videoHeight;
            }

            setLoading(false);
            setIsReady(true);

            // İLK BAŞTA HER İKİ STATE'İ DE AYARLA
            const initialText = 'Yüzünüzü kameraya gösterin';
            setDisplayedEmotion(initialText);
            setCurrentEmotion('🤖 Hazır');
          });
        };

      } catch (error) {
        if (!isMounted) return;

        setLoading(false);
        if (error.name === 'NotAllowedError') {
          setDisplayedEmotion('Kamera izni gerekli');
          setCurrentEmotion('❌ İzin Gerekli');
        } else {
          setDisplayedEmotion('Kamera açılamadı');
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
    };
  }, []);

  // Tespit başlatma - ayrı useEffect
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
        </div>

        {loading && (
          <div className="loading">
            <div className="spinner"></div>
            Başlatılıyor...
          </div>
        )}
      </div>

      <div className="fun-section">
        <div className="header">
          <img src={logo} alt="Logo" className="logo" />
          <h2>🧠 Duygu Dedektörü</h2>
        </div>

        <div className="current-emotion">
          <div className="big-emoji">
            {currentEmotion.split(' ')[0] || '🤖'}
          </div>
          <p className="emotion-label">
            {currentEmotion.split(' ').slice(1).join(' ') || 'Sistem Hazır'}
          </p>
        </div>

        {/* ÖNERİ BÖLÜMÜ - HER ZAMAN GÖRÜNÜR */}
        <div className="recommendation">
          <h4>💡 AI Tavsiyesi</h4>
          <p>{recommendation || 'Bir duygu tespit edildiğinde tavsiye gösterilecek'}</p>
        </div>

        <div className="controls">
          <button
            className="btn primary"
            onClick={() => setShowHistory(!showHistory)}
          >
            {showHistory ? '🧠 Ana Ekran' : '📊 Duygu Geçmişi'}
          </button>
        </div>

        {showHistory && (
          <div className="history-section">
            <h4>📈 Son Duygular</h4>

            {emotionHistory.length > 0 ? (
              <div className="history-grid">
                {emotionHistory.map((item, index) => (
                  <div key={index} className="history-card">
                    <span className="emotion">{item.emotion}</span>
                    <div className="meta">
                      <span className="time">{item.timestamp}</span>
                      <span className="confidence">%{item.confidence}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="no-data">Henüz duygu kaydı yok</p>
            )}
          </div>
        )}

        <div className="footer">
          <p>🤖 AI Duygu Analizi v.Early</p>
          <p>
            <a
              href="https://ilkyar.org.tr/" target="_blank" rel="noopener noreferrer"
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
