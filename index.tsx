/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { GoogleGenAI, Type, Part } from '@google/genai';
import { useState, useRef } from 'react';
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
  const videoRef = useRef<HTMLVideoElement>(null);

  const timestampToSeconds = (ts: string): number => {
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

  const generateThumbnails = (chaptersData: any, videoFile: File): Promise<any> => {
    return new Promise((resolve, reject) => {
      if (!chaptersData.chapters || chaptersData.chapters.length === 0) {
        resolve(chaptersData);
        return;
      }
      
      const video = document.createElement('video');
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error("Canvas context를 사용할 수 없습니다."));
        return;
      }

      const videoUrl = URL.createObjectURL(videoFile);
      video.preload = 'metadata';
      video.src = videoUrl;
      video.muted = true;

      const chaptersWithThumbnails = [...chaptersData.chapters];
      let processedCount = 0;
      setLoadingMessage(`썸네일 생성 중... (0/${chaptersData.chapters.length})`);

      video.onloadedmetadata = async () => {
        const aspectRatio = video.videoWidth / video.videoHeight;
        canvas.width = 480;
        canvas.height = canvas.width / aspectRatio;

        try {
          for (let i = 0; i < chaptersWithThumbnails.length; i++) {
            const chapter = chaptersWithThumbnails[i];
            const time = timestampToSeconds(chapter.timestamp);

            await new Promise<void>((resolveSeek) => {
              video.onseeked = () => {
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                chaptersWithThumbnails[i].thumbnail = canvas.toDataURL('image/jpeg');
                processedCount++;
                setLoadingMessage(`썸네일 생성 중... (${processedCount}/${chaptersWithThumbnails.length})`);
                resolveSeek();
              };
              video.currentTime = time;
            });
          }
          URL.revokeObjectURL(videoUrl);
          resolve({ ...chaptersData, chapters: chaptersWithThumbnails });
        } catch (e) {
          URL.revokeObjectURL(videoUrl);
          reject(e);
        }
      };

      video.onerror = () => {
        URL.revokeObjectURL(videoUrl);
        reject(new Error("비디오 파일을 불러올 수 없습니다. 파일이 손상되었거나 지원되지 않는 형식일 수 있습니다."));
      };
    });
  };

  const getChaptersPromptAndSchema = () => {
    return {
      prompt: `이 영상/음성 파일을 분석하여 주요 주제별로 챕터를 나눠주세요. 각 챕터는 시작 시간(HH:MM:SS 또는 MM:SS 형식)과 간결한 챕터 제목을 포함해야 합니다. 내용의 흐름을 파악하여 논리적인 구간으로 나누고, 영상/음성 파일의 타임라인에 맞춰 타임스탬프를 생성해주세요. 추가로, 영상의 내용을 바탕으로 시청자들의 흥미를 유발할 수 있는 유튜브 영상 설명글 스타일의 매력적인 소개글을 생성해주세요. 재치있는 제목, 호기심을 자극하는 문구, 이모티콘 등을 자유롭게 사용하세요. 마지막으로, 영상의 핵심 내용을 대표하는 관련성 높은 해시태그 10개를 한국어로 생성해주세요. 결과는 반드시 JSON 형식이어야 합니다.`,
      schema: {
        type: Type.OBJECT,
        properties: {
          summary: {
            type: Type.STRING,
            description: '시청자의 흥미를 유발하는 유튜브 영상 설명글 스타일의 매력적인 소개글입니다.',
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
          }
        },
        required: ['summary', 'chapters', 'hashtags'],
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
      setError('분석할 영상 또는 음성 파일을 선택해주세요.');
      return;
    }
    if (inputType === 'url' && !url.trim()) {
      setError('분석할 파일의 URL을 입력해주세요.');
      return;
    }

    setIsLoading(true);
    setLoadingMessage('');
    setError('');
    setResult(null);
    cleanupVideoUrl();

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    let fileToUpload: File | null = null;

    try {
      const { prompt, schema } = getChaptersPromptAndSchema();
      
      if (inputType === 'url') {
        setLoadingMessage('URL에서 파일 다운로드 중...');
        try {
          const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
          const response = await fetch(proxyUrl);
          if (!response.ok) {
            throw new Error(`파일을 다운로드할 수 없습니다. 서버 응답: ${response.status}`);
          }
          const blob = await response.blob();
          const fileName = url.substring(url.lastIndexOf('/') + 1).split('?')[0] || 'downloaded_file';
          fileToUpload = new File([blob], fileName, { type: blob.type });
        } catch (fetchError) {
          console.error(fetchError);
          throw new Error('URL에서 파일을 가져오는 데 실패했습니다. 링크가 유효한지 확인하거나, 파일을 직접 업로드하는 방법을 시도해보세요.');
        }
      } else if (file) {
        fileToUpload = file;
      }

      if (fileToUpload) {
        setAnalyzedVideoUrl(URL.createObjectURL(fileToUpload));
      } else {
         throw new Error('분석할 파일이 제공되지 않았습니다.');
      }

      setLoadingMessage('파일 업로드 중...');
      const uploadResponse = await ai.files.upload({ file: fileToUpload });

      setLoadingMessage('파일 처리 중...');
      let fileState = await ai.files.get({ name: uploadResponse.name });
      while (fileState.state === 'PROCESSING') {
        await new Promise((resolve) => setTimeout(resolve, 5000));
        fileState = await ai.files.get({ name: fileState.name });
      }

      if (fileState.state === 'FAILED') {
        throw new Error('파일 처리에 실패했습니다. 다른 파일을 시도해주세요.');
      }
      
      if (fileState.state !== 'ACTIVE') {
        throw new Error(`파일이 활성 상태가 아닙니다. 현재 상태: ${fileState.state}`);
      }

      setLoadingMessage('AI 분석 중...');
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
        },
      });

      const jsonString = response.text.trim();
      const parsedJson = JSON.parse(jsonString);

      const resultWithThumbnails = await generateThumbnails(parsedJson, fileToUpload);
      setResult(resultWithThumbnails);

    } catch (e) {
      console.error(e);
      const errorMessage = e instanceof Error ? e.message : '분석 중 오류가 발생했습니다.';
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
    cleanupVideoUrl();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setError('');
      setResult(null);
      cleanupVideoUrl();
      e.target.value = '';
    }
  };

  const renderChapterResults = () => {
    if (!result || !result.chapters) return null;

    return (
      <>
        {result.summary && (
          <div className="result-card">
            <h2>📖 줄거리 요약</h2>
            <p className="summary-text">{result.summary}</p>
          </div>
        )}
        <div className="result-card">
          <h2>🎬 영상 챕터</h2>
          <ul className="chapter-list">
            {result.chapters.map((chapter, index) => (
              <li key={index}>
                <div className="thumbnail-wrapper">
                  {chapter.thumbnail && (
                     <img 
                        src={chapter.thumbnail} 
                        alt={`${chapter.title} 썸네일`} 
                        className="chapter-thumbnail"
                        onClick={() => handleSeekToTime(chapter.timestamp)}
                      />
                  )}
                  {chapter.thumbnail && (
                    <a
                      href={chapter.thumbnail}
                      download={`thumbnail_${chapter.title.replace(/[^a-z0-9]/gi, '_')}_${index}.jpeg`}
                      className="download-button"
                      aria-label={`${chapter.title} 썸네일 다운로드`}
                    >
                      썸네일 다운로드
                    </a>
                  )}
                </div>
                <div className="chapter-details">
                    <span className="chapter-title">{chapter.title}</span>
                    <span 
                      className="chapter-timestamp" 
                      onClick={() => handleSeekToTime(chapter.timestamp)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && handleSeekToTime(chapter.timestamp)}
                     >
                      {chapter.timestamp}
                    </span>
                </div>
              </li>
            ))}
          </ul>
          {result.hashtags && result.hashtags.length > 0 && (
            <div className="hashtags-container">
              <h3>✨ 추천 해시태그</h3>
              <div className="hashtags-list">
                {result.hashtags.map((tag, index) => (
                  <span key={index} className="hashtag-item">#{tag.trim()}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      </>
    );
  };

  return (
    <div className="container">
      <header className="app-header">
        <h1>AI 영상 분석기</h1>
        <p className="subtitle">자동으로 타임라인, 썸네일, 요약글, 해시태그까지 생성합니다.</p>
      </header>

      <section className="input-section">
        <div className="input-type-selector">
          <button
            className={`mode-button ${inputType === 'file' ? 'active' : ''}`}
            onClick={() => handleInputTypeChange('file')}
            aria-pressed={inputType === 'file'}
          >
            파일 업로드
          </button>
          <button
            className={`mode-button ${inputType === 'url' ? 'active' : ''}`}
            onClick={() => handleInputTypeChange('url')}
            aria-pressed={inputType === 'url'}
          >
            URL 링크
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
              aria-label="영상 또는 음성 파일 업로드"
            />
            <label htmlFor="file-upload" className={`file-input-label ${isLoading ? 'disabled' : ''}`}>
              영상 파일 선택
            </label>
            {file && <p className="file-name">선택된 파일: {file.name}</p>}
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
            <p className="input-note">참고: 공개 CORS 프록시를 사용하여 파일을 가져옵니다. 일부 링크나 대용량 파일은 불안정할 수 있습니다.</p>
          </div>
        )}
        <div className="generate-button-wrapper">
          <button onClick={handleGenerate} disabled={isLoading} className="generate-button">
            {isLoading ? (
              <>
                <div className="spinner" />
                <span>{loadingMessage || '처리 중...'}</span>
              </>
            ) : (
              '분석하기'
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
            {renderChapterResults()}
          </div>
        </div>
      )}
    </div>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);