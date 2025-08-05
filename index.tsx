/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { GoogleGenAI, Type } from '@google/genai';
import { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom/client';

const App = () => {
  const [inputType, setInputType] = useState<'file' | 'url'>('file');
  const [url, setUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [error, setError] = useState('');
  const [analyzedVideoUrl, setAnalyzedVideoUrl] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'chapters' | 'transcript' | 'cast'>('chapters');
  const [elapsedTime, setElapsedTime] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [copiedSummary, setCopiedSummary] = useState<string | null>(null);

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (isLoading) {
      setElapsedTime(0);
      interval = setInterval(() => {
        setElapsedTime(prevTime => prevTime + 1);
      }, 1000);
    } else if (interval) {
      clearInterval(interval);
      setElapsedTime(0);
    }
    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [isLoading]);


  const timestampToSeconds = (ts: string): number => {
    if (!ts || typeof ts !== 'string') return 0;
    const parts = ts.split(':').map(Number);
    if (parts.some(isNaN)) return 0;

    if (parts.length === 3) { // HH:MM:SS
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    if (parts.length === 2) { // MM:SS
      return parts[0] * 60 + parts[1];
    }
    return 0;
  };

  const handleSeekToTime = (time: string) => {
    if (videoRef.current) {
        videoRef.current.currentTime = timestampToSeconds(time);
        videoRef.current.play();
    }
  }

  const getPromptAndSchema = () => {
    return {
      prompt: `이 영상/음성 파일을 분석하여 주요 주제별로 챕터를 나눠주세요. 각 챕터는 시작 시간(HH:MM:SS 또는 MM:SS 형식)과 간결한 챕터 제목을 포함해야 합니다. 내용의 흐름을 파악하여 논리적인 구간으로 나누고, 영상/음성 파일의 타임라인에 맞춰 타임스탬프를 생성해주세요. 추가로, 영상의 내용을 바탕으로 세 가지 다른 스타일의 요약글을 생성해주세요. 첫째, 'engaging' 키에는 재치있는 제목, 이모티콘 등을 활용하여 시청자의 흥미를 유발하는 유튜브 영상 설명글 스타일의 매력적인 소개글을 작성합니다. 둘째, 'serious' 키에는 객관적이고 전문적인 톤으로 사실에 기반한 진지한 요약글을 작성합니다. 셋째, 'content_focused' 키에는 영상의 핵심 내용과 정보를 간결하게 전달하는 내용 중심의 요약글을 작성합니다. 영상의 핵심 내용을 대표하는 관련성 높은 해시태그 10개를 한국어로 생성해주세요. 영상 전체에 대한 스크립트를 시간대별로 작성해주세요. 각 스크립트 대사에는 시작 시간(HH:MM:SS 또는 MM:SS 형식)과 해당 내용이 포함되어야 합니다. 마지막으로, 영상 자막을 기반으로 출연자 정보를 추출해주세요. 자막에 명시된 각 출연자별로 주요 발언들을 목록으로 만들어주세요. 'speaker' 필드에는 자막에 표시된 출연자의 이름, 소속, 직책 등을 포함한 전체 텍스트를 그대로 사용해야 합니다 (예: "진행자 (이광섭)", "정다운 연구원"). 일반적인 '진행자'나 '출연자 1' 같은 추상적인 명칭을 사용하는 대신, 자막에 나타나는 구체적인 텍스트를 정확히 반영해주세요. 각 발언에는 해당 자막이 나타나는 정확한 시간(HH:MM:SS 또는 MM:SS 형식)과 실제 자막 내용(text)이 포함되어야 합니다. 결과는 반드시 JSON 형식이어야 합니다.`,
      schema: {
        type: Type.OBJECT,
        properties: {
          summary: {
            type: Type.OBJECT,
            description: '세 가지 스타일의 영상 요약입니다.',
            properties: {
              engaging: {
                type: Type.STRING,
                description: '시청자의 흥미를 유발하는 유튜브 영상 설명글 스타일의 매력적인 소개글입니다. (재치있는 제목, 이모티콘 포함)',
              },
              serious: {
                type: Type.STRING,
                description: '객관적이고 전문적인 톤으로 작성된 진지한 버전의 요약입니다.',
              },
              content_focused: {
                type: Type.STRING,
                description: '영상의 핵심 내용과 정보를 간결하게 전달하는 내용 중심의 요약입니다.',
              },
            },
            required: ['engaging', 'serious', 'content_focused'],
          },
          chapters: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                timestamp: {
                  type: Type.STRING,
                  description: '챕터가 시작되는 시간 (HH:MM:SS 또는 MM:SS 형식).',
                },
                title: {
                  type: Type.STRING,
                  description: '해당 챕터의 내용을 요약하는 간결한 제목입니다.',
                },
              },
              required: ['timestamp', 'title'],
            },
            description: '영상/음성 파일을 기반으로 생성된 챕터 목록입니다.',
          },
          hashtags: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: '영상의 핵심 내용을 요약하는 10개의 관련 해시태그입니다.'
          },
          transcript: {
            type: Type.ARRAY,
            description: '시간대별로 나누어진 영상/음성 전체 스크립트입니다.',
            items: {
              type: Type.OBJECT,
              properties: {
                timestamp: {
                  type: Type.STRING,
                  description: '스크립트 대사가 시작되는 시간 (HH:MM:SS 또는 MM:SS 형식).',
                },
                text: {
                  type: Type.STRING,
                  description: '해당 시간의 스크립트 내용입니다.',
                },
              },
              required: ['timestamp', 'text'],
            },
          },
          cast: {
            type: Type.ARRAY,
            description: '영상 자막에 명시된 출연자별 주요 발언 목록입니다.',
            items: {
              type: Type.OBJECT,
              properties: {
                speaker: {
                  type: Type.STRING,
                  description: "자막에 표시된 출연자의 이름, 소속, 직책 등을 포함한 전체 텍스트. (예: '진행자 (이광섭)', '정다운 연구원').",
                },
                dialogues: {
                  type: Type.ARRAY,
                  description: '해당 출연자의 주요 발언 목록입니다.',
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      timestamp: {
                        type: Type.STRING,
                        description: '해당 발언이 시작되는 시간 (HH:MM:SS 또는 MM:SS 형식).',
                      },
                      text: {
                        type: Type.STRING,
                        description: '자막에 표시된 실제 발언 내용입니다.',
                      },
                    },
                    required: ['timestamp', 'text'],
                  },
                },
              },
              required: ['speaker', 'dialogues'],
            },
          },
        },
        required: ['summary', 'chapters', 'hashtags', 'transcript', 'cast'],
      },
    };
  };

  const cleanupVideoUrl = () => {
    if (analyzedVideoUrl) {
      URL.revokeObjectURL(analyzedVideoUrl);
      setAnalyzedVideoUrl(null);
    }
  };

  const handleGenerate = async () => {
    if (inputType === 'file' && !file) {
      setError('어떤 파일을 분석할까요? 영상이나 음성 파일을 선택해주세요.');
      return;
    }
    if (inputType === 'url' && !url.trim()) {
      setError('분석할 파일의 주소(URL)를 입력해주세요.');
      return;
    }

    setIsLoading(true);
    setLoadingMessage('');
    setError('');
    setResult(null);
    setActiveTab('chapters');
    cleanupVideoUrl();

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    let fileToUpload: File | null = null;

    try {
      const { prompt, schema } = getPromptAndSchema();
      
      if (inputType === 'url') {
        setLoadingMessage('URL에서 파일을 가져오는 중... 📥');
        try {
          const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
          const response = await fetch(proxyUrl);
          if (!response.ok) {
            throw new Error(`URL에서 파일을 가져올 수 없어요. 링크가 올바른지 다시 확인해주세요.`);
          }
          const blob = await response.blob();
          const fileName = url.substring(url.lastIndexOf('/') + 1).split('?')[0] || 'downloaded_file';
          fileToUpload = new File([blob], fileName, { type: blob.type });
        } catch (fetchError) {
          console.error(fetchError);
           throw new Error('URL에서 파일을 가져오는 데 실패했어요. 링크가 유효한지, 파일을 직접 업로드 해보세요.');
        }
      } else if (file) {
        fileToUpload = file;
      }

      if (fileToUpload) {
        if (fileToUpload.type.startsWith('video/')) {
            setAnalyzedVideoUrl(URL.createObjectURL(fileToUpload));
        }
      } else {
         throw new Error('분석할 파일이 없어요. 다시 시도해주세요.');
      }

      setLoadingMessage('파일을 업로드 하고있어요. 파일이 크면 조금 더 걸릴 수 있어요 🚀');
      const uploadResponse = await ai.files.upload({ file: fileToUpload });

      setLoadingMessage('AI가 파일을 읽고 있어요. 잠시만 기다려주세요... 🤖');
      let fileState = await ai.files.get({ name: uploadResponse.name });
      while (fileState.state === 'PROCESSING') {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        fileState = await ai.files.get({ name: fileState.name });
      }

      if (fileState.state === 'FAILED') {
        throw new Error('파일을 처리하는 데 실패했어요. 다른 파일을 올려보시겠어요?');
      }
      
      if (fileState.state !== 'ACTIVE') {
        throw new Error(`파일이 아직 준비되지 않았어요. (상태: ${fileState.state})`);
      }

      setLoadingMessage('AI가 영상을 분석하고 있어요. 거의 다 됐어요! ⏳');
      const contents = [
        { text: prompt },
        {
          fileData: {
            mimeType: fileState.mimeType,
            fileUri: fileState.uri,
          },
        },
      ];

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: contents,
        config: {
          responseMimeType: 'application/json',
          responseSchema: schema,
          thinkingConfig: { thinkingBudget: 0 },
        },
      });

      const jsonString = response.text.trim();
      const parsedJson = JSON.parse(jsonString);
      
      setResult(parsedJson);

    } catch (e) {
      console.error(e);
      const errorMessage = e instanceof Error ? e.message : '예상치 못한 문제가 발생했어요.';
      setError(`${errorMessage} 잠시 후 다시 시도해주세요.`);
      cleanupVideoUrl();
    } finally {
      setIsLoading(false);
      setLoadingMessage('');
    }
  };

  const handleInputTypeChange = (newType: 'file' | 'url') => {
    setInputType(newType);
    setError('');
    setResult(null);
    setFile(null);
    setUrl('');
    setActiveTab('chapters');
    cleanupVideoUrl();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setError('');
      setResult(null);
      setActiveTab('chapters');
      cleanupVideoUrl();
      e.target.value = '';
    }
  };

  const handleCopySummary = (textToCopy: string, type: string) => {
    navigator.clipboard.writeText(textToCopy).then(() => {
      setCopiedSummary(type);
      setTimeout(() => {
        setCopiedSummary(null);
      }, 2000);
    }).catch(err => {
      console.error("클립보드 복사 실패:", err);
      // Optionally, show an error message to the user
    });
  };

  const renderSummaryAndChapters = () => {
    if (!result) return null;
  
    return (
      <>
        {result.summary && (
          <div className="result-card">
            <h2>📊 한눈에 보는 요약</h2>
            <div className="summary-version">
              <div className="summary-header">
                <h3>재치있는 요약 (유튜브 스타일)</h3>
                <button 
                  className={`copy-button ${copiedSummary === 'engaging' ? 'copied' : ''}`}
                  onClick={() => handleCopySummary(result.summary.engaging, 'engaging')}>
                  {copiedSummary === 'engaging' ? '✓ 복사완료' : '복사'}
                </button>
              </div>
              <p className="summary-text">{result.summary.engaging}</p>
            </div>
            <div className="summary-version">
              <div className="summary-header">
                <h3>자세한 요약 (전문가 톤)</h3>
                <button 
                  className={`copy-button ${copiedSummary === 'serious' ? 'copied' : ''}`}
                  onClick={() => handleCopySummary(result.summary.serious, 'serious')}>
                  {copiedSummary === 'serious' ? '✓ 복사완료' : '복사'}
                </button>
              </div>
              <p className="summary-text">{result.summary.serious}</p>
            </div>
            <div className="summary-version">
              <div className="summary-header">
                <h3>핵심 요약</h3>
                <button 
                  className={`copy-button ${copiedSummary === 'content_focused' ? 'copied' : ''}`}
                  onClick={() => handleCopySummary(result.summary.content_focused, 'content_focused')}>
                  {copiedSummary === 'content_focused' ? '✓ 복사완료' : '복사'}
                </button>
              </div>
              <p className="summary-text">{result.summary.content_focused}</p>
            </div>
          </div>
        )}
        {result.chapters && result.chapters.length > 0 && (
          <div className="result-card">
            <h2>🎬 핵심 장면 바로가기</h2>
            <ul className="chapter-list">
              {result.chapters.map((chapter, index) => (
                <li key={index}
                  onClick={() => handleSeekToTime(chapter.timestamp)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && handleSeekToTime(chapter.timestamp)}
                >
                  <span className="chapter-title">{chapter.title}</span>
                  <span className="chapter-timestamp">
                    {chapter.timestamp}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {result.hashtags && result.hashtags.length > 0 && (
           <div className="result-card">
              <h3>✨ 추천 해시태그</h3>
              <div className="hashtags-list">
                {result.hashtags.map((tag, index) => (
                  <span key={index} className="hashtag-item">#{tag.trim().replace(/^#+/, '')}</span>
                ))}
              </div>
            </div>
        )}
      </>
    );
  };

  const renderTranscript = () => {
    if (!result || !result.transcript) return null;

    return (
      <div className="result-card">
        <h2>📜 전체 대본 보기</h2>
        <ul className="transcript-list">
          {result.transcript.map((segment, index) => (
            <li key={index} className="transcript-segment">
              <span 
                className="transcript-timestamp"
                onClick={() => handleSeekToTime(segment.timestamp)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && handleSeekToTime(segment.timestamp)}
              >
                {segment.timestamp}
              </span>
              <p className="transcript-text">{segment.text}</p>
            </li>
          ))}
        </ul>
      </div>
    );
  };

  const renderCast = () => {
    if (!result || !result.cast || result.cast.length === 0) return null;
  
    return (
      <div className="result-card">
        <h2>🎙️ 누가 말했을까?</h2>
        <div className="cast-list">
          {result.cast.map((person, personIndex) => (
            <div key={personIndex} className="cast-member">
              <h4 className="cast-speaker-name">{person.speaker}</h4>
              <ul className="cast-dialogue-list">
                {person.dialogues.map((dialogue, dialogueIndex) => (
                  <li 
                    key={dialogueIndex} 
                    className="cast-dialogue-item"
                    onClick={() => handleSeekToTime(dialogue.timestamp)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && handleSeekToTime(dialogue.timestamp)}
                  >
                    <span className="cast-dialogue-timestamp">{dialogue.timestamp}</span>
                    <p className="cast-dialogue-text">{dialogue.text}</p>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="container">
      <header className="app-header">
        <h1>AI 영상 분석기</h1>
        <p className="subtitle">영상 하나로 챕터, 3가지 버전 요약, 전체 대본까지 한 번에 정리해 보세요.</p>
      </header>

      <section className="input-section">
        <div className="input-type-selector">
          <button
            className={`mode-button ${inputType === 'file' ? 'active' : ''}`}
            onClick={() => handleInputTypeChange('file')}
            aria-pressed={inputType === 'file'}
          >
            파일 올리기
          </button>
          <button
            className={`mode-button ${inputType === 'url' ? 'active' : ''}`}
            onClick={() => handleInputTypeChange('url')}
            aria-pressed={inputType === 'url'}
          >
            URL로 올리기
          </button>
        </div>
        {inputType === 'file' ? (
          <div className="file-input-container">
            <input
              type="file"
              id="file-upload"
              className="file-input"
              onChange={handleFileChange}
              disabled={isLoading}
              accept="video/*,audio/*"
              aria-label="영상 또는 음성 파일 선택"
            />
            <label htmlFor="file-upload" className={`file-input-label ${isLoading ? 'disabled' : ''}`}>
              영상/음성 파일 선택
            </label>
            {file && <p className="file-name">선택한 파일: {file.name}</p>}
          </div>
        ) : (
          <div className="url-input-container">
            <input
              type="url"
              className="url-input"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/video.mp4"
              disabled={isLoading}
              aria-label="파일 URL 입력"
            />
            <p className="input-note">URL의 파일을 안전하게 가져오기 위해 외부 서비스를 이용해요. 일부 링크는 분석이 어려울 수 있습니다.</p>
          </div>
        )}
        <div className="generate-button-wrapper">
          <button onClick={handleGenerate} disabled={isLoading} className="generate-button">
            {isLoading ? (
              <>
                <div className="spinner" />
                <span>{loadingMessage} ({elapsedTime}초)</span>
              </>
            ) : (
              '분석 시작하기'
            )}
          </button>
        </div>
      </section>

      {error && <p className="error">{error}</p>}
      
      {(result || analyzedVideoUrl) && (
        <div className="content-area">
          <div className="player-panel">
            {analyzedVideoUrl && (
              <div className="video-player-container">
                <video ref={videoRef} className="video-player" src={analyzedVideoUrl} controls preload="metadata"></video>
              </div>
            )}
          </div>
          <div className="results-panel">
             {result && (
              <div className="results-tabs">
                <button 
                  className={`tab-button ${activeTab === 'chapters' ? 'active' : ''}`}
                  onClick={() => setActiveTab('chapters')}
                  aria-pressed={activeTab === 'chapters'}
                >
                  핵심 요약
                </button>
                <button
                  className={`tab-button ${activeTab === 'transcript' ? 'active' : ''}`}
                  onClick={() => setActiveTab('transcript')}
                  disabled={!result.transcript || result.transcript.length === 0}
                  aria-pressed={activeTab === 'transcript'}
                >
                  전체 대본
                </button>
                 <button
                  className={`tab-button ${activeTab === 'cast' ? 'active' : ''}`}
                  onClick={() => setActiveTab('cast')}
                  disabled={!result.cast || result.cast.length === 0}
                  aria-pressed={activeTab === 'cast'}
                >
                  출연자별 대사
                </button>
              </div>
             )}
            <div className="results-content">
              {activeTab === 'chapters' && renderSummaryAndChapters()}
              {activeTab === 'transcript' && renderTranscript()}
              {activeTab === 'cast' && renderCast()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);