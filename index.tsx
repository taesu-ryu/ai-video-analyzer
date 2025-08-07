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
  const [videoMetadata, setVideoMetadata] = useState<{ duration: string; resolution: string } | null>(null);
  const [activeTab, setActiveTab] = useState<'chapters' | 'transcript' | 'cast' | 'brand' | 'evaluation'>('chapters');
  const [elapsedTime, setElapsedTime] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [copiedSummary, setCopiedSummary] = useState<string | null>(null);
  const [copiedTranscript, setCopiedTranscript] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

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
    const companyList = `코오롱인더스트리 제조부문, 코오롱인더스트리 FnC부문(코오롱 인더스트리 에프엔씨부문), 코오롱스페이스웍스(코오롱 스페이스웍스, Kolon Spaceworks), 코오롱글로벌 (코오롱 글로벌), 코오롱모빌리티그룹 (코오롱 모빌리티그룹), 코오롱모터스 (코오롱 모터스), 코오롱아우토 (코오롱 아우토), 코오롱오토모티브 (코오롱 오토모티브), 코오롱제이모빌리티 (코오롱 제이모빌리티), 코오롱베니트 (코오롱 베니트), 코오롱생명과학, 코오롱제약, 코오롱바스프이노폼 (코오롱 바스프 이노폼), 코오롱글로텍 (코오롱 글로텍), 코오롱머티리얼 (코오롱 머티리얼), 코오롱LSI (코오롱 엘에스아이), 코오롱ENP (코오롱 이엔피), 코오롱하우스비전 (코오롱 하우스비전), 코오롱인베스트먼트 (코오롱 인베스트먼트), 테크비전 (코오롱 테크비전), 슈퍼트레인 (코오롱 슈퍼트레인), 코오롱де크컴퍼지트 (코오롱 데크 컴퍼지트), 그린나래, 엠오디 (코오롱 엠오디), 네이처브리지 (코오롱 네이처브리지), 퍼플아이오 (코오롱 퍼플아이오), 스위트밀 (코오롱 스위트밀), 이노베이스 (코오롱 이노베이스), 파파모빌리티 (코오롱 파파모빌리티), 아토메탈테크코리아 (코오롱 아토메탈 테크 코리아), 엑시아머티리얼스 (코오롱 엑시아 머티리얼스), 코오롱라이프스타일컴퍼니 (코오롱 라이프스타일 컴퍼니), 리베토코리아 (코오롱 리베토 코리아), 코오롱바이오텍 (코오롱 바이오텍), 어바웃피싱 (코오롱 어바웃 피싱), 에픽프라퍼티인베스트먼트컴퍼니 (코오롱 에픽 프라퍼티 인베스트먼트 컴퍼니), 트래스코 (코오롱 트래스코), 케이오에이 (코오롱 케이오에이), 기브릿지 (코오롱 기브릿지), 비아스텔레코리아 (코오롱 비아스텔레 코리아), 더블유파트너스 (코오롱 더블유 파트너스), 로터스카스코리아 (코오롱 로터스 카스 코리아), 삼척오두풍력발전, 양산에덴밸리풍력발전, 천안북부일반산업단지, 코오롱이앤씨 (코오롱 이앤씨), 서서울고속도로, 티슈진 더블유스토어 (코오롱 티슈진 더블유 스토어)`;
    return {
      prompt: `이 영상/음성 파일을 분석하여 주요 주제별로 챕터를 나눠주세요. 각 챕터는 시작 시간(HH:MM:SS 또는 MM:SS 형식)과 간결한 챕터 제목을 포함해야 합니다. 내용의 흐름을 파악하여 논리적인 구간으로 나누고, 영상/음성 파일의 타임라인에 맞춰 타임스탬프를 생성해주세요. 추가로, 영상의 내용을 바탕으로 세 가지 다른 스타일의 요약글을 생성해주세요. 첫째, 'engaging' 키에는 재치있는 제목, 이모티콘 등을 활용하여 시청자의 흥미를 유발하는 유튜브 영상 설명글 스타일의 매력적인 소개글을 작성합니다. 둘째, 'serious' 키에는 객관적이고 전문적인 톤으로 사실에 기반한 진지한 요약글을 작성합니다. 셋째, 'content_focused' 키에는 영상의 핵심 내용과 정보를 간결하게 전달하는 내용 중심의 요약글을 작성합니다. 영상의 핵심 내용을 대표하는 관련성 높은 해시태그 10개를 한국어로 생성해주세요. 영상 전체 스크립트를 생성해주세요. 의미적으로 연관된 문장들은 하나의 단락으로 묶어주세요. 각 단락은 타임스탬프 없이 'text' 필드만 포함하는 객체의 배열 형태로 제공해주세요. 영상 자막을 기반으로 출연자 정보를 추출해주세요. 자막에 명시된 각 출연자별로 주요 발언들을 목록으로 만들어주세요. 'speaker' 필드에는 자막에 표시된 출연자의 이름, 소속, 직책 등을 포함한 전체 텍스트를 그대로 사용해야 합니다 (예: "진행자 (이광섭)", "정다운 연구원"). 일반적인 '진행자'나 '출연자 1' 같은 추상적인 명칭을 사용하는 대신, 자막에 나타나는 구체적인 텍스트를 정확히 반영해주세요. 또한, 영상/음성 파일의 음성 데이터만을 분석하여 다음 목록에 있는 회사 이름이 언급되는 모든 지점을 찾아주세요. 시각적인 정보(자막, 로고 등)는 무시하고 오직 음성으로 언급된 경우만 포함해야 합니다. 각 회사별로, 이름이 언급된 각각의 장면에 대해 타임스탬프(HH:MM:SS 또는 MM:SS 형식)와 그 발언의 맥락을 한 줄로 요약한 설명을 함께 제공해주세요. 결과에 포함된 회사 이름은 아래 목록에 있는 이름과 정확히 일치해야 합니다. 다음은 분석할 회사 목록입니다: ${companyList}. 마지막으로, 이 영상을 종합적으로 평가해주세요. 평가 항목은 '기획 및 구성', '영상미 및 편집', '내용 및 메시지', '기술적 완성도'를 포함해야 합니다. 각 항목에 대한 세부 평가 내용과 10점 만점의 점수를 부여해주세요. 이 평가를 바탕으로 '긍정적인 점'과 '개선이 필요한 점'을 각각 500자 내외의 가독성 좋은 문단으로 요약해주세요. 결과는 반드시 JSON 형식이어야 합니다.`,
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
            description: '의미있는 단락으로 나누어진 영상/음성 전체 스크립트입니다.',
            items: {
              type: Type.OBJECT,
              properties: {
                text: {
                  type: Type.STRING,
                  description: '하나의 의미 단락을 구성하는 전체 텍스트입니다.',
                },
              },
              required: ['text'],
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
          brandExposure: {
            type: Type.ARRAY,
            description: '영상에 시각적으로 노출된 지정된 회사 목록 및 해당 노출 시간과 맥락입니다.',
            items: {
              type: Type.OBJECT,
              properties: {
                companyName: {
                  type: Type.STRING,
                  description: '영상에서 발견된 회사의 이름입니다.',
                },
                appearances: {
                  type: Type.ARRAY,
                  description: '해당 회사가 노출된 시간 및 맥락 목록입니다.',
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      timestamp: {
                        type: Type.STRING,
                        description: '노출이 시작된 시간 (HH:MM:SS 또는 MM:SS 형식).',
                      },
                      context: {
                        type: Type.STRING,
                        description: '브랜드가 노출될 때의 장면에 대한 한 줄 요약입니다.'
                      }
                    },
                    required: ['timestamp', 'context']
                  },
                },
              },
              required: ['companyName', 'appearances'],
            },
          },
          evaluation: {
            type: Type.OBJECT,
            description: '영상에 대한 종합적인 평가입니다.',
            properties: {
              scores: {
                type: Type.ARRAY,
                description: '항목별 세부 평가 점수표입니다.',
                items: {
                  type: Type.OBJECT,
                  properties: {
                    category: { type: Type.STRING, description: "평가 항목 (예: '기획 및 구성')." },
                    details: { type: Type.STRING, description: '해당 항목에 대한 세부 평가 내용입니다.' },
                    score: { type: Type.INTEGER, description: '10점 만점 기준으로 부여된 점수입니다.' },
                  },
                  required: ['category', 'details', 'score'],
                },
              },
              positiveFeedback: { type: Type.STRING, description: '평가 기반의 긍정적인 점 요약 (500자 내외).' },
              improvementPoints: { type: Type.STRING, description: '평가 기반의 개선이 필요한 점 요약 (500자 내외).' },
            },
            required: ['scores', 'positiveFeedback', 'improvementPoints'],
          },
        },
        required: ['summary', 'chapters', 'hashtags', 'transcript', 'cast', 'brandExposure', 'evaluation'],
      },
    };
  };

  const cleanupVideoUrl = () => {
    if (analyzedVideoUrl) {
      URL.revokeObjectURL(analyzedVideoUrl);
      setAnalyzedVideoUrl(null);
    }
    setVideoMetadata(null);
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
  
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!isLoading) {
      setIsDraggingOver(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingOver(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingOver(false);
    if (isLoading) return;

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const droppedFile = files[0];
      if (droppedFile.type.startsWith('video/') || droppedFile.type.startsWith('audio/')) {
        setFile(droppedFile);
        setError('');
        setResult(null);
        setActiveTab('chapters');
        cleanupVideoUrl();
      } else {
        setError('영상이나 음성 파일만 올릴 수 있어요.');
      }
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
    });
  };

  const handleCopyTranscript = () => {
    if (!result || !result.transcript) return;
    const fullText = result.transcript.map(p => p.text).join('\n\n');
    navigator.clipboard.writeText(fullText).then(() => {
        setCopiedTranscript(true);
        setTimeout(() => setCopiedTranscript(false), 2000);
    }).catch(err => {
        console.error("클립보드 복사 실패:", err);
    });
  };

  const formatDuration = (totalSeconds: number): string => {
    if (isNaN(totalSeconds) || totalSeconds < 0) return '00:00';
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.floor(totalSeconds % 60);

    const paddedMinutes = String(minutes).padStart(2, '0');
    const paddedSeconds = String(seconds).padStart(2, '0');

    if (hours > 0) {
      return `${hours}:${paddedMinutes}:${paddedSeconds}`;
    }
    return `${paddedMinutes}:${paddedSeconds}`;
  };

  const handleVideoMetadata = (event: React.SyntheticEvent<HTMLVideoElement, Event>) => {
    const video = event.currentTarget;
    if (video.videoWidth > 0 && video.videoHeight > 0) {
      setVideoMetadata({
        duration: formatDuration(video.duration),
        resolution: `${video.videoWidth}x${video.videoHeight}`,
      });
    }
  };

  const renderSummaryAndChapters = () => {
    if (!result) return null;
  
    return (
      <>
        {result.summary && (
          <div className="result-card">
            <h2>한눈에 보는 요약</h2>
            <div className="summary-version">
              <div className="summary-header">
                <h3>재치있는 요약 (유튜브 스타일)</h3>
                <button 
                  className="copy-button"
                  onClick={() => handleCopySummary(result.summary.engaging, 'engaging')}>
                  {copiedSummary === 'engaging' ? '복사완료 ✓' : '복사하기'}
                </button>
              </div>
              <p className="summary-text">{result.summary.engaging}</p>
            </div>
            <div className="summary-version">
              <div className="summary-header">
                <h3>자세한 요약 (전문가 톤)</h3>
                <button 
                   className="copy-button"
                  onClick={() => handleCopySummary(result.summary.serious, 'serious')}>
                  {copiedSummary === 'serious' ? '복사완료 ✓' : '복사하기'}
                </button>
              </div>
              <p className="summary-text">{result.summary.serious}</p>
            </div>
            <div className="summary-version">
              <div className="summary-header">
                <h3>핵심 요약</h3>
                <button 
                  className="copy-button"
                  onClick={() => handleCopySummary(result.summary.content_focused, 'content_focused')}>
                  {copiedSummary === 'content_focused' ? '복사완료 ✓' : '복사하기'}
                </button>
              </div>
              <p className="summary-text">{result.summary.content_focused}</p>
            </div>
          </div>
        )}
        {result.chapters && result.chapters.length > 0 && (
          <div className="result-card">
            <h2>핵심 장면 바로가기</h2>
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
              <h3>추천 해시태그</h3>
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
  
    const fullTranscriptText = result.transcript.map(segment => segment.text).join('\n\n');

    return (
      <div className="result-card">
        <div className="transcript-header">
            <h2>전체 대본 보기</h2>
            <button
                className="copy-button"
                onClick={handleCopyTranscript}
            >
                {copiedTranscript ? '복사완료 ✓' : '복사하기'}
            </button>
        </div>
        <pre className="transcript-full-text">{fullTranscriptText}</pre>
      </div>
    );
  };

  const renderCast = () => {
    if (!result || !result.cast || result.cast.length === 0) return null;
  
    return (
      <div className="result-card">
        <h2>누가 말했을까?</h2>
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

  const renderBrandExposure = () => {
    if (!result || !result.brandExposure || result.brandExposure.length === 0) return null;

    return (
      <div className="result-card">
        <h2>브랜드 노출</h2>
        <div className="brand-exposure-list">
          {result.brandExposure.map((item, index) => (
            <div key={index} className="brand-exposure-item">
              <h4 className="brand-company-name">{item.companyName}</h4>
              <ul className="brand-appearances-list">
                {item.appearances.map((appearance, tsIndex) => (
                  <li 
                    key={tsIndex} 
                    className="brand-appearance-item"
                    onClick={() => handleSeekToTime(appearance.timestamp)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && handleSeekToTime(appearance.timestamp)}
                  >
                    <span className="brand-appearance-timestamp">{appearance.timestamp}</span>
                    <p className="brand-appearance-context">{appearance.context}</p>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderEvaluation = () => {
    if (!result || !result.evaluation) return null;
    const { scores, positiveFeedback, improvementPoints } = result.evaluation;
  
    return (
      <div className="result-card">
        <h2>종합 평가</h2>
        <div className="evaluation-summary-container">
          <div className="evaluation-summary-card">
            <h3>👍 긍정적인 점</h3>
            <p>{positiveFeedback}</p>
          </div>
          <div className="evaluation-summary-card">
            <h3>🤔 개선이 필요한 점</h3>
            <p>{improvementPoints}</p>
          </div>
        </div>
        <div className="evaluation-table-container">
          <h3>상세 평가 점수</h3>
          <table className="evaluation-table">
            <thead>
              <tr>
                <th>평가 항목</th>
                <th>세부 평가 내용</th>
                <th>점수</th>
              </tr>
            </thead>
            <tbody>
              {scores.map((item, index) => (
                <tr key={index}>
                  <td className="eval-category">{item.category}</td>
                  <td className="eval-details">{item.details}</td>
                  <td className="eval-score">{item.score} / 10</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="container">
      <header className="app-header">
        <h1>AI 영상 분석기</h1>
        <p className="subtitle">영상 하나로 줄거리 요약, 전체 스크립트, 출연자 정보, 종합평가까지 한 번에 정리해 보세요.</p>
      </header>

      <main>
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
            <div
              className={`file-input-container ${isDraggingOver ? 'drag-over' : ''} ${isLoading ? 'disabled' : ''}`}
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
            >
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
                컴퓨터에서 파일 선택
              </label>
              <p className="drag-drop-text">또는 파일을 이곳에 드래그&드롭하세요</p>
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
                  <video
                    ref={videoRef}
                    className="video-player"
                    src={analyzedVideoUrl}
                    controls
                    preload="metadata"
                    onLoadedMetadata={handleVideoMetadata}
                  ></video>
                </div>
              )}
              {videoMetadata && (
                <div className="video-metadata-card">
                  <div className="metadata-item">
                    <span className="metadata-label">영상 길이</span>
                    <span className="metadata-value">{videoMetadata.duration}</span>
                  </div>
                  <div className="metadata-item">
                    <span className="metadata-label">해상도</span>
                    <span className="metadata-value">{videoMetadata.resolution}</span>
                  </div>
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
                  <button
                    className={`tab-button ${activeTab === 'brand' ? 'active' : ''}`}
                    onClick={() => setActiveTab('brand')}
                    disabled={!result.brandExposure || result.brandExposure.length === 0}
                    aria-pressed={activeTab === 'brand'}
                  >
                    브랜드 노출
                  </button>
                  <button
                    className={`tab-button ${activeTab === 'evaluation' ? 'active' : ''}`}
                    onClick={() => setActiveTab('evaluation')}
                    disabled={!result.evaluation}
                    aria-pressed={activeTab === 'evaluation'}
                  >
                    종합 평가
                  </button>
                </div>
               )}
              <div className="results-content">
                {activeTab === 'chapters' && renderSummaryAndChapters()}
                {activeTab === 'transcript' && renderTranscript()}
                {activeTab === 'cast' && renderCast()}
                {activeTab === 'brand' && renderBrandExposure()}
                {activeTab === 'evaluation' && renderEvaluation()}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);