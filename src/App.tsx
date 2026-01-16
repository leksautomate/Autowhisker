
import { useState, useEffect, useRef } from 'react';
import { FolderOpen, Image as ImageIcon, Settings, CheckCircle, AlertCircle, Download, Edit2, RefreshCw, X, Trash2 } from 'lucide-react';

/* Types */
interface QueueItem {
  id: string;
  prompt: string;
  status: 'pending' | 'processing' | 'done' | 'error' | 'paused';
  imageUrl?: string;
  errorMsg?: string;
  timestamp: string;
  isEditing?: boolean;
}

interface SessionStatus {
  status: 'idle' | 'checking' | 'connected' | 'expired' | 'error';
  message: string;
}

function App() {
  /* Configuration State - with localStorage persistence */
  const [cookie, setCookie] = useState(() => {
    const saved = localStorage.getItem('whisk-cookie');
    return saved || '';
  });
  const [aspectRatio, setAspectRatio] = useState(() => {
    const saved = localStorage.getItem('whisk-aspect-ratio');
    return saved || 'LANDSCAPE';
  });
  const [promptsInput, setPromptsInput] = useState('');
  const [saveFolder] = useState('C:\\Users\\leksi\\Desktop\\Project\\Autowhisker\\output');
  const [referenceImages, setReferenceImages] = useState<File[]>([]);
  const [projectName, setProjectName] = useState(() => {
    const saved = localStorage.getItem('whisk-project-name');
    return saved || 'My Whisk Project';
  });

  /* Session Status State */
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>({
    status: 'idle',
    message: 'Ready to start'
  });

  /* Save cookie to localStorage when it changes */
  useEffect(() => {
    if (cookie) {
      localStorage.setItem('whisk-cookie', cookie);
    }
  }, [cookie]);

  /* Save aspect ratio to localStorage when it changes */
  useEffect(() => {
    localStorage.setItem('whisk-aspect-ratio', aspectRatio);
  }, [aspectRatio]);

  /* Save project name to localStorage */
  useEffect(() => {
    localStorage.setItem('whisk-project-name', projectName);
  }, [projectName]);

  /* Processing State */
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  // Ref to track processing state inside async loop without dependencies issues
  const processingRef = useRef(false);
  const pausedRef = useRef(false);

  /* Update refs when state changes */
  useEffect(() => {
    processingRef.current = isProcessing;
  }, [isProcessing]);

  useEffect(() => {
    pausedRef.current = isPaused;
  }, [isPaused]);

  /* Start Generation Logic */
  const handleStart = () => {
    if (!cookie) {
      alert("Please enter your Whisk Cookie first!");
      return;
    }

    // 1. Parse Prompts
    const lines = promptsInput.split('\n').filter(line => line.trim().length > 0);

    // If input is empty but queue has pending items, just start processing
    const hasPending = queue.some(i => i.status === 'pending');
    if (lines.length === 0 && !hasPending) {
      alert("Please enter prompts in the list!");
      return;
    }

    // 2. Add to Queue (if promptsInput has text, add them, then clear input)
    if (lines.length > 0) {
      const newItems: QueueItem[] = lines.map(line => ({
        id: crypto.randomUUID(),
        prompt: line.trim(),
        status: 'pending',
        timestamp: new Date().toLocaleTimeString()
      }));
      setQueue(prev => [...prev, ...newItems]);
      setPromptsInput(''); // Clear input after adding
    }

    // 3. Trigger Processing
    setIsPaused(false);
    pausedRef.current = false;

    // Slight delay to ensure state updates if we just added items
    setTimeout(() => {
      if (!processingRef.current) {
        setIsProcessing(true);
        processingRef.current = true; // Set ref immediately before calling
        processQueue();
      }
    }, 100);
  };

  const handlePause = () => {
    setIsPaused(true);
    setIsProcessing(false); // Will stop the loop after current item
  };

  const handleStop = () => {
    setIsProcessing(false);
    setIsPaused(false);
    processingRef.current = false;
  };

  /* Validate Cookie / Check Session */
  const handleCheckCookie = async () => {
    if (!cookie.trim()) {
      setSessionStatus({ status: 'error', message: 'Please enter a cookie first' });
      return;
    }

    setSessionStatus({ status: 'checking', message: 'Validating cookie...' });

    try {
      const res = await fetch('http://localhost:5000/api/validate-cookie', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cookie })
      });
      const data = await res.json();

      if (data.valid) {
        setSessionStatus({ status: 'connected', message: data.message || 'Connected!' });
      } else {
        if (data.status === 'Expired') {
          setSessionStatus({ status: 'expired', message: data.message });
        } else {
          setSessionStatus({ status: 'error', message: data.message || data.error });
        }
      }
    } catch (err: any) {
      setSessionStatus({ status: 'error', message: 'Cannot connect to server' });
    }
  };

  /* Handle Reference Image Upload */
  const handleReferenceImagesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      setReferenceImages(prev => [...prev, ...files].slice(0, 3)); // Max 3 images
    }
  };

  const removeReferenceImage = (index: number) => {
    setReferenceImages(prev => prev.filter((_, i) => i !== index));
  };

  /* Edit Prompt */
  const startEditingPrompt = (itemId: string) => {
    setQueue(prev => prev.map(item =>
      item.id === itemId ? { ...item, isEditing: true } : item
    ));
  };

  const savePromptEdit = (itemId: string, newPrompt: string) => {
    setQueue(prev => prev.map(item =>
      item.id === itemId ? { ...item, prompt: newPrompt, isEditing: false } : item
    ));
  };

  const cancelEditingPrompt = (itemId: string) => {
    setQueue(prev => prev.map(item =>
      item.id === itemId ? { ...item, isEditing: false } : item
    ));
  };

  /* Retry Single Item */
  const retrySingleItem = (itemId: string) => {
    setQueue(prev => prev.map(item =>
      item.id === itemId ? { ...item, status: 'pending' as const, errorMsg: undefined } : item
    ));
    // Start processing if not already
    if (!processingRef.current) {
      setTimeout(() => {
        setIsProcessing(true);
        processingRef.current = true;
        processQueue();
      }, 100);
    }
  };

  /* Retry All Errors */
  const retryAllErrors = () => {
    setQueue(prev => prev.map(item =>
      item.status === 'error' ? { ...item, status: 'pending' as const, errorMsg: undefined } : item
    ));
    // Start processing if not already
    if (!processingRef.current) {
      setTimeout(() => {
        setIsProcessing(true);
        processingRef.current = true;
        processQueue();
      }, 100);
    }
  };

  /* Download Single Image */
  const downloadSingleImage = async (imageUrl: string, index: number) => {
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = `${index + 1}.png`; // Explicit .png extension
      document.body.appendChild(a);
      a.click();

      // Cleanup
      setTimeout(() => {
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      }, 100);
    } catch (err) {
      console.error('Download failed:', err);
      // Fallback: try direct server download
      const originalFilename = imageUrl.split('/').pop() || 'image.png';
      const downloadFilename = `${index + 1}.png`;
      window.open(`http://localhost:5000/api/download/${originalFilename}?name=${encodeURIComponent(downloadFilename)}`, '_blank');
    }
  };

  /* Download All as ZIP */
  const downloadAllAsZip = async () => {
    const completedItems = queue.filter(item => item.status === 'done' && item.imageUrl && item.imageUrl !== 'check_gallery');

    if (completedItems.length === 0) {
      alert('No completed images to download');
      return;
    }

    try {
      // Dynamically import JSZip from CDN
      // @ts-ignore
      const JSZip = (await import('https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm')).default;
      const zip = new JSZip();

      // Fetch all images and add to zip
      for (let i = 0; i < completedItems.length; i++) {
        const item = completedItems[i];
        try {
          const response = await fetch(item.imageUrl!);
          const blob = await response.blob();
          zip.file(`${i + 1}.png`, blob);
        } catch (err) {
          console.error(`Failed to fetch image ${i + 1}:`, err);
        }
      }

      // Generate and download zip
      const content = await zip.generateAsync({ type: 'blob' });
      const url = window.URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${projectName.replace(/[^a-zA-Z0-9]/g, '_')}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('ZIP creation failed:', err);
      alert('Failed to create ZIP file');
    }
  }


  /* Clear All Images */
  const handleClearAll = async () => {
    if (!confirm('Are you sure you want to delete ALL images? This cannot be undone.')) {
      return;
    }

    try {
      const res = await fetch('http://localhost:5000/api/images', {
        method: 'DELETE'
      });
      const data = await res.json();

      if (data.success) {
        // Clear local queue images that were downloaded/generated
        // We keep the queue items but remove the image URL reference if it was pointing to a file
        setQueue(prev => prev.map(item => ({
          ...item,
          imageUrl: undefined,
          status: item.status === 'done' ? 'pending' : item.status // Optional: reset status or keep as done but without image? 
          // Better: maybe just remove them from queue? Or keep history but show "Deleted"?
          // For now, let's just clear the "imageUrl" so they show as "Deleted/Missing" or we can just clear the whole queue?
          // The user request said "clear image from database... delete it all". 
          // Usually implies clearing the workspace. Let's clear the queue too or at least the images.
        })));

        // Actually, if we delete files, the queue items pointing to them are broken.
        // Let's probably clear the finished items from the queue or mark them as expired.
        // For simplicity and "Start Fresh" feel:
        setQueue(prev => prev.filter(item => item.status !== 'done')); // Remove done items?
        // Or maybe just keep them but they will fail to load. 
        // Let's go with: Remove all "Done" items from the UI list as they are no longer on disk.
      }
    } catch (err) {
      console.error('Failed to clear images:', err);
      alert('Failed to clear images');
    }
  };

  /* The Processing Loop */
  const processQueue = async () => {
    processNext();
  };

  const processNext = async () => {
    if (!processingRef.current) return;
    if (pausedRef.current) return;

    // Use a promise to get the next item from the queue
    const nextItem = await new Promise<QueueItem | undefined>((resolve) => {
      setQueue(prevQueue => {
        const pending = prevQueue.find(item => item.status === 'pending');
        if (pending) {
          // Mark as processing and return the item via promise
          setTimeout(() => resolve(pending), 0);
          return prevQueue.map(item =>
            item.id === pending.id ? { ...item, status: 'processing' as const } : item
          );
        }
        setTimeout(() => resolve(undefined), 0);
        return prevQueue;
      });
    });

    if (!nextItem) {
      // No pending items left
      setIsProcessing(false);
      return;
    }

    console.log('[App] Processing:', nextItem.prompt);

    // Perform Generation
    try {
      const res = await fetch('http://localhost:5000/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cookie,
          prompt: nextItem.prompt,
          aspectRatio
        })
      });
      const data = await res.json();

      console.log('[App] Response:', data);

      setQueue(prev => prev.map(item => {
        if (item.id === nextItem.id) {
          if (data.success) {
            return { ...item, status: 'done' as const, imageUrl: data.result?.url || 'check_gallery' };
          } else {
            return { ...item, status: 'error' as const, errorMsg: data.error };
          }
        }
        return item;
      }));

      // Attempt to link the image by fetching latest
      if (data.success) {
        await fetchLatestImageFor(nextItem.id);
      }

    } catch (err: any) {
      console.error('[App] Error:', err);
      setQueue(prev => prev.map(item =>
        item.id === nextItem.id ? { ...item, status: 'error' as const, errorMsg: err.message || 'Network Error' } : item
      ));
    }

    // Delay before next (2s)
    setTimeout(() => {
      processNext();
    }, 2000);
  };

  const fetchLatestImageFor = async (itemId: string) => {
    try {
      const res = await fetch('http://localhost:5000/api/images');
      const files = await res.json();
      if (files.length > 0) {
        const latestInfo = files[0];
        setQueue(prev => prev.map(item =>
          item.id === itemId && item.status === 'done'
            ? { ...item, imageUrl: latestInfo.url }
            : item
        ));
      }
    } catch (e) { }
  };

  return (
    <div className="flex h-screen bg-gray-100 font-sans text-sm selection:bg-purple-200">

      {/* LEFT SIDEBAR */}
      <div className="w-[340px] flex flex-col bg-white border-r border-gray-300 shadow-sm transition-all">
        {/* Header */}
        <div className="p-3 border-b border-gray-200 flex items-center justify-between bg-gray-50">
          <h1 className="font-bold text-gray-700 flex items-center gap-2">
            <Settings className="w-4 h-4 text-purple-600" />
            Autowhisker
          </h1>
          <div className="flex text-xs border border-gray-300 rounded overflow-hidden">
            <div className="px-2 py-1 bg-gray-200 text-gray-400 cursor-not-allowed">VN</div>
            <div className="px-2 py-1 bg-blue-500 text-white font-medium">US</div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">

          {/* Account Config */}
          <div className="space-y-2">
            <div className="bg-gray-700 text-white px-3 py-1 rounded text-xs font-bold inline-block">
              Account Configuration
            </div>
            <div className="border border-gray-300 rounded p-2 bg-gray-50 group hover:border-blue-400 transition-colors">
              <label className="text-xs font-semibold text-gray-500 block mb-1">Cookie (JSON):</label>
              <textarea
                className="w-full h-16 text-xs font-mono border border-gray-300 rounded p-1 resize-none focus:outline-none focus:border-blue-400"
                placeholder='[ { "domain": ".labs.google", ... } ] or "string"'
                value={cookie}
                onChange={(e) => setCookie(e.target.value)}
              />
              <div className="flex gap-2 mt-2">
                <button
                  className="flex-1 bg-blue-500 hover:bg-blue-600 text-white py-1 rounded text-xs font-semibold shadow-sm transition"
                  onClick={() => window.open('https://github.com/rohitaryal/whisk-api#help', '_blank')}
                >
                  ? User Manual
                </button>
                <button
                  onClick={handleCheckCookie}
                  disabled={sessionStatus.status === 'checking'}
                  className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 text-white py-1 rounded text-xs font-semibold shadow-sm transition"
                >
                  {sessionStatus.status === 'checking' ? 'Checking...' : 'Check & Save'}
                </button>
              </div>
            </div>
          </div>

          {/* Session Status */}
          <div className="space-y-1">
            <div className="bg-gray-700 text-white px-3 py-1 rounded text-xs font-bold inline-block">
              Session Status
            </div>
            <div className={`border rounded p-2 h-10 flex items-center justify-center gap-2 ${sessionStatus.status === 'connected' ? 'bg-green-50 border-green-400' :
              sessionStatus.status === 'expired' ? 'bg-red-50 border-red-400' :
                sessionStatus.status === 'error' ? 'bg-orange-50 border-orange-400' :
                  sessionStatus.status === 'checking' ? 'bg-blue-50 border-blue-400' :
                    'bg-gray-50 border-gray-300'
              }`}>
              {sessionStatus.status === 'checking' && (
                <div className="animate-spin rounded-full h-3 w-3 border-2 border-blue-500 border-t-transparent"></div>
              )}
              {sessionStatus.status === 'connected' && <CheckCircle size={14} className="text-green-500" />}
              {sessionStatus.status === 'expired' && <AlertCircle size={14} className="text-red-500" />}
              {sessionStatus.status === 'error' && <AlertCircle size={14} className="text-orange-500" />}
              <span className={`text-xs ${sessionStatus.status === 'connected' ? 'text-green-600 font-medium' :
                sessionStatus.status === 'expired' ? 'text-red-600 font-medium' :
                  sessionStatus.status === 'error' ? 'text-orange-600' :
                    sessionStatus.status === 'checking' ? 'text-blue-600' :
                      'text-gray-400 italic'
                }`}>
                {sessionStatus.message}
              </span>
            </div>
          </div>

          {/* Settings */}
          <div className="space-y-2">
            <div className="bg-gray-700 text-white px-3 py-1 rounded text-xs font-bold inline-block">
              Configuration & Prompts
            </div>
            <div className="border border-gray-300 rounded p-3 bg-white space-y-3 shadow-sm">
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-xs font-semibold text-gray-500 block mb-1">Aspect Ratio:</label>
                  <select
                    className="w-full border border-gray-300 rounded p-1 text-xs focus:ring-1 focus:ring-blue-400 outline-none"
                    value={aspectRatio}
                    onChange={(e) => setAspectRatio(e.target.value)}
                  >
                    <option value="LANDSCAPE">Horizontal 16:9</option>
                    <option value="PORTRAIT">Vertical 9:16</option>
                    <option value="SQUARE">Square 1:1</option>
                  </select>
                </div>
                <div className="w-16">
                  <label className="text-xs font-semibold text-gray-500 block mb-1">Count:</label>
                  <select className="w-full border border-gray-300 rounded p-1 text-xs" disabled>
                    <option>1</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <label className="bg-gray-600 text-white text-xs py-1 px-2 rounded flex items-center gap-2 cursor-pointer hover:bg-gray-700">
                  <ImageIcon size={14} />
                  Reference Images ({referenceImages.length})
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={handleReferenceImagesChange}
                  />
                </label>
                {referenceImages.length > 0 && (
                  <div className="flex gap-1 flex-wrap">
                    {referenceImages.map((file, idx) => (
                      <div key={idx} className="relative w-12 h-12 rounded border border-gray-200 overflow-hidden group">
                        <img
                          src={URL.createObjectURL(file)}
                          alt={`Ref ${idx + 1}`}
                          className="w-full h-full object-cover"
                        />
                        <button
                          onClick={() => removeReferenceImage(idx)}
                          className="absolute inset-0 bg-red-500/70 text-white text-xs opacity-0 group-hover:opacity-100 transition"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-1">Prompts List:</label>
                <textarea
                  className="w-full h-32 border border-gray-300 rounded p-2 text-xs leading-relaxed focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200"
                  placeholder="Enter prompts below (one per line)..."
                  value={promptsInput}
                  onChange={(e) => setPromptsInput(e.target.value)}
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-1">Save Folder:</label>
                <div className="flex gap-1">
                  <input
                    type="text"
                    className="flex-1 border border-gray-300 rounded p-1 text-xs text-gray-500 bg-gray-50"
                    value={saveFolder}
                    readOnly
                  />
                  <button className="px-2 bg-gray-600 text-white rounded hover:bg-gray-700">
                    <FolderOpen size={14} />
                  </button>
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* Footer Controls */}
        <div className="p-3 border-t border-gray-200 bg-white grid grid-cols-3 gap-2 sticky bottom-0 z-10">
          <button
            onClick={handleStart}
            className={`flex items-center justify-center gap-1 py-3 rounded font-bold text-white shadow-sm transition-all transform hover:scale-[1.02] active:scale-95 ${isProcessing ? 'bg-green-700 opacity-80' : 'bg-green-500 hover:bg-green-600'}`}
          >
            {isProcessing ? 'RUNNING' : 'START NOW'}
          </button>

          <button
            onClick={handlePause}
            className="bg-orange-400 hover:bg-orange-500 text-white font-bold py-3 rounded shadow-sm transition-all transform hover:scale-[1.02] active:scale-95"
          >
            PAUSE
          </button>

          <button
            onClick={handleStop}
            className="bg-red-500 hover:bg-red-600 text-white font-bold py-3 rounded shadow-sm transition-all transform hover:scale-[1.02] active:scale-95"
          >
            STOP
          </button>
        </div>
      </div>

      {/* RIGHT CONTENT - Queue Table */}
      <div className="flex-1 flex flex-col bg-white border-l border-gray-300 overflow-hidden">
        {/* Table Header with Project Name */}
        <div className="bg-gray-100 border-b border-gray-300 py-2 px-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-gray-500">Project:</span>
            <input
              type="text"
              className="text-sm font-medium text-gray-700 border border-gray-300 rounded px-2 py-1 focus:outline-none focus:border-blue-400"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="My Project"
            />
          </div>
          <button
            onClick={downloadAllAsZip}
            className="flex items-center gap-1 bg-green-500 hover:bg-green-600 text-white text-xs font-bold py-1 px-3 rounded shadow-sm"
          >
            <Download size={12} />
            Download ZIP
          </button>
        </div>

        {/* Column Headers */}
        <div className="bg-gray-50 border-b border-gray-200 py-2 px-2 flex text-xs font-bold text-gray-600 uppercase tracking-wide">
          <div className="w-12 text-center">#</div>
          <div className="flex-1 px-2">Prompt</div>
          <div className="w-48 text-center">Image 1</div>
          <div className="w-40 text-center">Status</div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto bg-white">
          {queue.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-gray-300 select-none">
              <Settings size={64} className="mb-4 opacity-20" />
              <p className="text-lg font-light">Queue is empty</p>
              <p className="text-sm">Add prompts to start generating</p>
            </div>
          )}

          <div className="divide-y divide-gray-100">
            {queue.map((item, idx) => (
              <div key={item.id} className="flex items-start py-3 px-2 text-sm hover:bg-gray-50 transition-colors">

                {/* ID */}
                <div className="w-12 text-center text-gray-400 font-mono text-xs pt-1">
                  {idx + 1}
                </div>

                {/* Prompt - Editable */}
                <div className="flex-1 px-2 min-w-0">
                  {item.isEditing ? (
                    <div className="flex gap-1">
                      <input
                        type="text"
                        defaultValue={item.prompt}
                        className="flex-1 border border-blue-400 rounded p-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            savePromptEdit(item.id, (e.target as HTMLInputElement).value);
                          } else if (e.key === 'Escape') {
                            cancelEditingPrompt(item.id);
                          }
                        }}
                        autoFocus
                      />
                      <button
                        onClick={(e) => {
                          const input = (e.target as HTMLButtonElement).parentElement?.querySelector('input');
                          if (input) savePromptEdit(item.id, input.value);
                        }}
                        className="p-1 bg-green-500 text-white rounded hover:bg-green-600"
                      >
                        <CheckCircle size={14} />
                      </button>
                      <button
                        onClick={() => cancelEditingPrompt(item.id)}
                        className="p-1 bg-gray-400 text-white rounded hover:bg-gray-500"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <div
                      className="bg-white border border-gray-200 rounded p-2 text-gray-700 text-xs leading-relaxed shadow-sm cursor-pointer hover:border-blue-300 group flex items-start justify-between"
                      onClick={() => (item.status === 'error' || item.status === 'pending') && startEditingPrompt(item.id)}
                    >
                      <span className="flex-1">{item.prompt}</span>
                      {(item.status === 'error' || item.status === 'pending') && (
                        <Edit2 size={12} className="text-gray-300 group-hover:text-blue-400 ml-2 flex-shrink-0" />
                      )}
                    </div>
                  )}
                </div>

                {/* Image */}
                <div className="w-48 flex flex-col items-center justify-center px-2 gap-1">
                  {item.imageUrl && item.imageUrl !== 'check_gallery' ? (
                    <>
                      <a href={item.imageUrl} target="_blank" className="relative group block w-full aspect-video rounded-md overflow-hidden border border-gray-200 hover:ring-2 hover:ring-blue-400 transition cursor-pointer shadow-sm">
                        <img src={item.imageUrl} alt="Result" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <FolderOpen className="text-white drop-shadow-md" size={20} />
                        </div>
                      </a>
                      <button
                        onClick={() => downloadSingleImage(item.imageUrl!, idx)}
                        className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700"
                      >
                        <Download size={10} />
                        Download
                      </button>
                    </>
                  ) : (
                    <div className="w-full aspect-video bg-gray-50 rounded-md border border-gray-200 border-dashed flex items-center justify-center">
                      <div className="text-gray-300 text-xs">--</div>
                    </div>
                  )}
                </div>

                {/* Status */}
                <div className="w-40 flex flex-col items-center justify-center gap-1 pt-2">
                  {/* Status Text */}
                  <span className={`text-xs font-medium ${item.status === 'done' ? 'text-green-600' :
                    item.status === 'error' ? 'text-red-500' :
                      item.status === 'processing' ? 'text-blue-600' :
                        item.status === 'paused' ? 'text-orange-500' : 'text-gray-400'
                    }`}>
                    {item.status === 'done' ? 'Completed' :
                      item.status === 'processing' ? 'Creating 1/1' :
                        item.status === 'pending' ? 'Waiting' :
                          item.status === 'paused' ? 'Paused' : 'Error'}
                  </span>

                  {/* Error message */}
                  {item.status === 'error' && item.errorMsg && (
                    <span className="text-[10px] text-red-400 text-center max-w-full truncate" title={item.errorMsg}>
                      {item.errorMsg.slice(0, 30)}...
                    </span>
                  )}

                  {/* Action Buttons */}
                  <div className="flex gap-1 mt-1">
                    {/* Completed: View & Download */}
                    {item.status === 'done' && (
                      <>
                        <a href={item.imageUrl} target="_blank" className="p-1 bg-orange-500 text-white rounded hover:bg-orange-600 shadow-sm" title="View">
                          <ImageIcon size={12} />
                        </a>
                        <button onClick={() => downloadSingleImage(item.imageUrl!, idx)} className="p-1 bg-blue-500 text-white rounded hover:bg-blue-600 shadow-sm" title="Download">
                          <Download size={12} />
                        </button>
                      </>
                    )}

                    {/* Error: Retry & Edit */}
                    {item.status === 'error' && (
                      <>
                        <button onClick={() => retrySingleItem(item.id)} className="p-1 bg-green-500 text-white rounded hover:bg-green-600 shadow-sm" title="Retry">
                          <RefreshCw size={12} />
                        </button>
                        <button onClick={() => startEditingPrompt(item.id)} className="p-1 bg-blue-500 text-white rounded hover:bg-blue-600 shadow-sm" title="Edit">
                          <Edit2 size={12} />
                        </button>
                      </>
                    )}

                    {/* Processing: Spinner */}
                    {item.status === 'processing' && (
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-500 border-t-transparent"></div>
                    )}
                  </div>
                </div>

              </div>
            ))}
          </div>
        </div>

        {/* Footer Actions Bar */}
        <div className="bg-gray-100 border-t border-gray-300 p-2 flex justify-between items-center">
          <span className="text-xs text-gray-500">
            {queue.filter(i => i.status === 'done').length} completed / {queue.length} total
          </span>
          <div className="flex gap-2">
            <button
              onClick={retryAllErrors}
              className="flex items-center gap-1 bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold py-1 px-3 rounded shadow-sm"
            >
              <RefreshCw size={12} />
              Retry All Errors
            </button>
            <button
              onClick={handleClearAll}
              className="flex items-center gap-1 bg-red-500 hover:bg-red-600 text-white text-xs font-bold py-1 px-3 rounded shadow-sm"
            >
              <Trash2 size={12} />
              Clear All
            </button>
            <button
              onClick={downloadAllAsZip}
              className="flex items-center gap-1 bg-green-500 hover:bg-green-600 text-white text-xs font-bold py-1 px-3 rounded shadow-sm"
            >
              <Download size={12} />
              Download All
            </button>
          </div>
        </div>
      </div>

    </div>
  );
}

export default App;
