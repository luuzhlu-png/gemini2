import { useState, useRef, useCallback } from 'react';
import { GoogleGenAI } from '@google/genai';
import { UploadCloud, FileAudio, CheckCircle, AlertCircle, Loader2, Download, Trash2, Play, FileText } from 'lucide-react';

type ProcessStatus = 'idle' | 'processing' | 'success' | 'error';

interface AudioFile {
  id: string;
  file: File;
  status: ProcessStatus;
  resultText?: string;
  error?: string;
}

const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = (error) => reject(error);
  });
};

const downloadTxt = (filename: string, text: string) => {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  // Replace original extension with .txt
  a.download = filename.replace(/\.[^/.]+$/, "") + ".txt";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

export default function App() {
  const [files, setFiles] = useState<AudioFile[]>([]);
  const [isProcessingBatch, setIsProcessingBatch] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files).map((file) => ({
        id: Math.random().toString(36).substring(7),
        file,
        status: 'idle' as ProcessStatus,
      }));
      setFiles((prev) => [...prev, ...newFiles]);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const processSingleFile = async (audioFile: AudioFile) => {
    setFiles((prev) =>
      prev.map((f) => (f.id === audioFile.id ? { ...f, status: 'processing', error: undefined } : f))
    );

    try {
      const base64 = await fileToBase64(audioFile.file);
      
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error("Gemini API Key is missing. Please configure it in the settings.");
      }

      const ai = new GoogleGenAI({ apiKey });
      
      const response = await ai.models.generateContent({
        model: 'gemini-3.1-pro-preview',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: audioFile.file.type || 'audio/mp3',
                data: base64,
              },
            },
            {
              text: "请将这段音频转换为文字。在转换后，请对文字进行逻辑编辑，确保段落划分合理、标点符号正确、语句通顺。请只输出最终编辑好的纯文本内容，不要包含任何额外的解释或说明。",
            },
          ],
        },
      });

      if (!response.text) {
        throw new Error("No text generated from the audio.");
      }

      setFiles((prev) =>
        prev.map((f) =>
          f.id === audioFile.id ? { ...f, status: 'success', resultText: response.text } : f
        )
      );
    } catch (error: any) {
      console.error("Error processing file:", error);
      setFiles((prev) =>
        prev.map((f) =>
          f.id === audioFile.id
            ? { ...f, status: 'error', error: error.message || "An unknown error occurred" }
            : f
        )
      );
    }
  };

  const startBatchProcess = async () => {
    setIsProcessingBatch(true);
    
    // Process sequentially to avoid rate limits and browser memory issues
    for (const file of files) {
      if (file.status === 'idle' || file.status === 'error') {
        await processSingleFile(file);
      }
    }
    
    setIsProcessingBatch(false);
  };

  const downloadAll = () => {
    const completedFiles = files.filter((f) => f.status === 'success' && f.resultText);
    completedFiles.forEach((file, index) => {
      // Slight delay to prevent browser from blocking multiple downloads
      setTimeout(() => {
        downloadTxt(file.file.name, file.resultText!);
      }, index * 300);
    });
  };

  const completedCount = files.filter((f) => f.status === 'success').length;
  const pendingCount = files.filter((f) => f.status === 'idle').length;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans p-6 md:p-12">
      <div className="max-w-5xl mx-auto space-y-8">
        
        {/* Header */}
        <header className="space-y-2">
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-slate-900">
            Audio to Text Converter
          </h1>
          <p className="text-slate-500 text-lg">
            Batch process MP3 files into logically formatted text documents.
          </p>
        </header>

        {/* Upload Area */}
        <div 
          className="border-2 border-dashed border-slate-300 rounded-2xl p-12 bg-white flex flex-col items-center justify-center text-center hover:bg-slate-50 transition-colors cursor-pointer"
          onClick={() => fileInputRef.current?.click()}
        >
          <div className="bg-indigo-50 text-indigo-600 p-4 rounded-full mb-4">
            <UploadCloud size={32} />
          </div>
          <h3 className="text-lg font-medium text-slate-900 mb-1">Click to upload MP3 files</h3>
          <p className="text-sm text-slate-500 max-w-md">
            Select multiple audio files to process them in batch. Files are processed securely using the Gemini API.
          </p>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            className="hidden"
            multiple
            accept="audio/mp3,audio/mpeg,audio/wav,audio/m4a"
          />
        </div>

        {/* Controls & Stats */}
        {files.length > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between bg-white p-4 rounded-xl shadow-sm border border-slate-200">
            <div className="flex space-x-6 text-sm mb-4 sm:mb-0">
              <div className="flex items-center text-slate-600">
                <FileAudio size={16} className="mr-2" />
                <span className="font-medium text-slate-900 mr-1">{files.length}</span> Total
              </div>
              <div className="flex items-center text-emerald-600">
                <CheckCircle size={16} className="mr-2" />
                <span className="font-medium mr-1">{completedCount}</span> Done
              </div>
              <div className="flex items-center text-amber-600">
                <Loader2 size={16} className="mr-2" />
                <span className="font-medium mr-1">{pendingCount}</span> Pending
              </div>
            </div>
            
            <div className="flex space-x-3 w-full sm:w-auto">
              {completedCount > 0 && (
                <button
                  onClick={downloadAll}
                  className="flex-1 sm:flex-none flex items-center justify-center px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors font-medium text-sm"
                >
                  <Download size={16} className="mr-2" />
                  Download All
                </button>
              )}
              <button
                onClick={startBatchProcess}
                disabled={isProcessingBatch || pendingCount === 0}
                className="flex-1 sm:flex-none flex items-center justify-center px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium text-sm shadow-sm"
              >
                {isProcessingBatch ? (
                  <>
                    <Loader2 size={16} className="mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Play size={16} className="mr-2" />
                    Start Batch
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* File List */}
        {files.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <ul className="divide-y divide-slate-100">
              {files.map((file) => (
                <li key={file.id} className="p-4 hover:bg-slate-50 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4 overflow-hidden">
                      <div className="bg-slate-100 p-2 rounded-lg text-slate-500 flex-shrink-0">
                        <FileAudio size={20} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">
                          {file.file.name}
                        </p>
                        <p className="text-xs text-slate-500">
                          {(file.file.size / (1024 * 1024)).toFixed(2)} MB
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-4 flex-shrink-0 ml-4">
                      {/* Status Indicator */}
                      <div className="flex items-center w-24 justify-end">
                        {file.status === 'idle' && (
                          <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-1 rounded-full">Pending</span>
                        )}
                        {file.status === 'processing' && (
                          <span className="flex items-center text-xs font-medium text-indigo-600 bg-indigo-50 px-2 py-1 rounded-full">
                            <Loader2 size={12} className="animate-spin mr-1" /> Processing
                          </span>
                        )}
                        {file.status === 'success' && (
                          <span className="flex items-center text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">
                            <CheckCircle size={12} className="mr-1" /> Done
                          </span>
                        )}
                        {file.status === 'error' && (
                          <span className="flex items-center text-xs font-medium text-red-600 bg-red-50 px-2 py-1 rounded-full" title={file.error}>
                            <AlertCircle size={12} className="mr-1" /> Error
                          </span>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center space-x-2">
                        {file.status === 'success' && file.resultText && (
                          <button
                            onClick={() => downloadTxt(file.file.name, file.resultText!)}
                            className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                            title="Download Text"
                          >
                            <FileText size={18} />
                          </button>
                        )}
                        <button
                          onClick={() => removeFile(file.id)}
                          disabled={file.status === 'processing'}
                          className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                          title="Remove File"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>
                  </div>
                  
                  {/* Error Message */}
                  {file.status === 'error' && file.error && (
                    <div className="mt-3 text-xs text-red-600 bg-red-50 p-2 rounded border border-red-100">
                      {file.error}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

      </div>
    </div>
  );
}
