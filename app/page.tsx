"use client";
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, Upload, Film, Music, Loader2, X, Clock } from 'lucide-react';

export default function UltraSlideshowGenerator() {
  const [images, setImages] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [audio, setAudio] = useState<File | null>(null);
  const [audioPreview, setAudioPreview] = useState<string | null>(null);
  const [audioDuration, setAudioDuration] = useState<number>(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState('');
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [effect, setEffect] = useState<'fade' | 'zoom' | 'slide' | 'zoomout' | 'pan' | 'smooth'>('smooth');
  const [duration, setDuration] = useState(3);
  const [ffmpeg, setFfmpeg] = useState<any>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const imageInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const loadFFmpeg = async () => {
      try {
        const { FFmpeg } = await import('@ffmpeg/ffmpeg');
        
        const ffmpegInstance = new FFmpeg();
        
        ffmpegInstance.on('log', ({ message }) => {
          console.log('FFmpeg:', message);
        });
        
        await ffmpegInstance.load();
        setFfmpeg(ffmpegInstance);
        setIsLoaded(true);
        console.log('FFmpeg loaded successfully');
      } catch (error) {
        console.error('Failed to load FFmpeg:', error);
        setError('Failed to load video engine. Please refresh the page.');
      }
    };

    loadFFmpeg();
  }, []);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles = Array.from(e.target.files);
      const remainingSlots = 8 - images.length;
      const filesToAdd = newFiles.slice(0, remainingSlots);
      
      if (filesToAdd.length === 0) {
        alert('You can only upload up to 8 images total');
        return;
      }

      const updatedImages = [...images, ...filesToAdd];
      setImages(updatedImages);
      const newPreviews = filesToAdd.map(file => URL.createObjectURL(file));
      setImagePreviews(prev => [...prev, ...newPreviews]);
    }
  };

  const handleAudioUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const audioFile = e.target.files[0];
      if (audioPreview) URL.revokeObjectURL(audioPreview);
      
      const newAudioPreview = URL.createObjectURL(audioFile);
      setAudio(audioFile);
      setAudioPreview(newAudioPreview);

      // Get audio duration
      const audio = new Audio();
      audio.src = newAudioPreview;
      audio.onloadedmetadata = () => {
        setAudioDuration(audio.duration);
      };
    }
  };

  const removeImage = (index: number) => {
    const newImages = [...images];
    const newPreviews = [...imagePreviews];
    URL.revokeObjectURL(newPreviews[index]);
    newImages.splice(index, 1);
    newPreviews.splice(index, 1);
    setImages(newImages);
    setImagePreviews(newPreviews);
  };

  const removeAudio = () => {
    if (audioPreview) URL.revokeObjectURL(audioPreview);
    setAudio(null);
    setAudioPreview(null);
    setAudioDuration(0);
    if (audioInputRef.current) audioInputRef.current.value = '';
  };

  const triggerImageInput = () => {
    if (imageInputRef.current) {
      imageInputRef.current.value = '';
      imageInputRef.current.click();
    }
  };

  const triggerAudioInput = () => {
    if (audioInputRef.current) {
      audioInputRef.current.value = '';
      audioInputRef.current.click();
    }
  };

  const clearAllImages = () => {
    imagePreviews.forEach(url => URL.revokeObjectURL(url));
    setImages([]);
    setImagePreviews([]);
  };

  useEffect(() => {
    return () => {
      imagePreviews.forEach(url => URL.revokeObjectURL(url));
      if (audioPreview) URL.revokeObjectURL(audioPreview);
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [imagePreviews, audioPreview, downloadUrl, previewUrl]);

  const getTransitionFilter = (effectType: string) => {
    const baseScale = 'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=black';
    const fps = 30;
    const totalFrames = duration * fps;
    
    switch (effectType) {
      case 'smooth':
        return `${baseScale},zoompan=z='1.0 + 0.0003*on':d=${totalFrames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1280x720:fps=${fps}`;
      
      case 'zoom':
        return `${baseScale},zoompan=z='min(zoom+0.0008,1.1)':d=${totalFrames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1280x720:fps=${fps}`;
      
      case 'zoomout':
        return `${baseScale},zoompan=z='if(lte(zoom,1.0),1.0,max(1.001,zoom-0.0008))':d=${totalFrames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1280x720:fps=${fps}:zoom=1.2`;
      
      case 'pan':
        return `${baseScale},zoompan=z=1.05:d=${totalFrames}:x='if(gte(on,1),(iw/1.05-iw)*(on/${totalFrames}),0)':y='ih/2-(ih/1.05/2)':s=1280x720:fps=${fps}`;
      
      case 'fade':
      case 'slide':
      default:
        return baseScale;
    }
  };

  const generateSlideshow = async () => {
    if (!images.length || !ffmpeg) {
      setError('Please select images and ensure FFmpeg is loaded');
      return;
    }
    
    setIsGenerating(true);
    setProgress(0);
    setCurrentStep('Initializing...');
    setDownloadUrl(null);
    setPreviewUrl(null);
    setShowPreview(false);
    setError(null);

    try {
      console.log('Starting slideshow generation with', images.length, 'images');

      // Clear any existing files
      try {
        const files = await ffmpeg.listDir('/');
        for (const file of files) {
          if (file.isDir) continue;
          if (file.name.startsWith('input') || file.name.startsWith('segment') || 
              file.name === 'audio.mp3' || file.name === 'output.mp4' || 
              file.name === 'concat.txt' || file.name === 'looped_video.mp4') {
            await ffmpeg.deleteFile(file.name);
          }
        }
      } catch (e) {
        console.log('No files to clear or error clearing:', e);
      }

      // Write images to FFmpeg
      setCurrentStep('Loading images...');
      for (let i = 0; i < images.length; i++) {
        const file = images[i];
        const data = await file.arrayBuffer();
        await ffmpeg.writeFile(`input${i}.jpg`, new Uint8Array(data));
        setProgress(Math.round(((i + 1) / images.length) * 15));
      }

      if (audio) {
        setCurrentStep('Loading audio...');
        const audioData = await audio.arrayBuffer();
        await ffmpeg.writeFile('audio.mp3', new Uint8Array(audioData));
        setProgress(20);
      }

      // Use the unified approach for all effects
      await createUnifiedSlideshow();

      console.log('Slideshow generated successfully!');
      setCurrentStep('Complete!');
      setProgress(100);
      setShowPreview(true);
      
    } catch (error) {
      console.error('Error generating slideshow:', error);
      setError(`Failed to generate slideshow: ${error instanceof Error ? error.message : 'Unknown error'}. Try with smaller images or fewer files.`);
    } finally {
      setIsGenerating(false);
    }

    async function createUnifiedSlideshow() {
      if (audio) {
        await createSlideshowWithAudio();
      } else {
        await createSlideshowWithoutAudio();
      }
    }

    async function createSlideshowWithAudio() {
      setCurrentStep('Calculating video length...');
      
      const singleImageDuration = duration;
      const totalImageDuration = images.length * singleImageDuration;
      const requiredLoops = Math.ceil(audioDuration / totalImageDuration);
      
      console.log(`Audio Duration: ${audioDuration}s`);
      console.log(`Single Loop: ${images.length} images × ${singleImageDuration}s = ${totalImageDuration}s`);
      console.log(`Required Loops: ${requiredLoops}`);
      console.log(`Total Video Before Trim: ${totalImageDuration * requiredLoops}s`);
      console.log(`Final Video (trimmed to audio): ${audioDuration}s`);

      const transitionFilter = getTransitionFilter(effect);
      const fps = 30;

      // STEP 1: Create individual video segments for each image
      setCurrentStep('Creating video segments...');
      setProgress(25);
      
      for (let i = 0; i < images.length; i++) {
        console.log(`Creating segment ${i} with duration ${singleImageDuration}s`);
        
        const segmentArgs = [
          '-loop', '1',
          '-i', `input${i}.jpg`,
          '-t', singleImageDuration.toString(),
          '-c:v', 'libx264',
          '-pix_fmt', 'yuv420p',
          '-vf', transitionFilter,
          '-r', fps.toString(),
          '-preset', 'ultrafast',
          '-y',
          `segment${i}.mp4`
        ];
        
        await ffmpeg.exec(segmentArgs);
        setProgress(25 + Math.round(((i + 1) / images.length) * 30));
        setCurrentStep(`Creating segment ${i + 1}/${images.length}...`);
      }

      // STEP 2: Create concat file with ALL required loops
      setCurrentStep(`Creating ${requiredLoops} loop(s) to match audio...`);
      setProgress(60);
      
      let concatList = '';
      for (let loop = 0; loop < requiredLoops; loop++) {
        for (let i = 0; i < images.length; i++) {
          concatList += `file 'segment${i}.mp4'\n`;
        }
      }
      
      console.log(`Concat list has ${requiredLoops * images.length} entries`);
      await ffmpeg.writeFile('concat.txt', new TextEncoder().encode(concatList));

      // STEP 3: Concatenate all looped segments into one long video
      setCurrentStep('Merging all loops...');
      setProgress(70);
      
      const concatArgs = [
        '-f', 'concat',
        '-safe', '0',
        '-i', 'concat.txt',
        '-c', 'copy',
        '-y',
        'looped_video.mp4'
      ];

      await ffmpeg.exec(concatArgs);
      console.log('Created looped video');

      // STEP 4: Combine with audio and trim to EXACT audio duration
      setCurrentStep('Syncing with audio...');
      setProgress(85);
      
      const combineArgs = [
        '-i', 'looped_video.mp4',
        '-i', 'audio.mp3',
        '-c:v', 'copy',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-map', '0:v:0',
        '-map', '1:a:0',
        '-t', audioDuration.toFixed(3),
        '-avoid_negative_ts', 'make_zero',
        '-y',
        'output.mp4'
      ];

      await ffmpeg.exec(combineArgs);
      setProgress(95);
      console.log(`Final video created with duration: ${audioDuration}s`);

      setCurrentStep('Finalizing...');

      // Read and set the output
      const fileData = await ffmpeg.readFile('output.mp4');
      const uint8Array = new Uint8Array(fileData);
      const blob = new Blob([uint8Array], { type: 'video/mp4' });
      const url = URL.createObjectURL(blob);
      setPreviewUrl(url);
      setDownloadUrl(url);
      
      console.log('✅ Slideshow generation complete!');
    }

    async function createSlideshowWithoutAudio() {
      setCurrentStep('Creating video segments...');
      
      const transitionFilter = getTransitionFilter(effect);
      const fps = 30;

      // Create individual segments for each image
      for (let i = 0; i < images.length; i++) {
        const segmentArgs = [
          '-loop', '1',
          '-i', `input${i}.jpg`,
          '-t', duration.toString(),
          '-c:v', 'libx264',
          '-pix_fmt', 'yuv420p',
          '-vf', transitionFilter,
          '-r', fps.toString(),
          '-y',
          `segment${i}.mp4`
        ];
        
        await ffmpeg.exec(segmentArgs);
        setProgress(20 + Math.round(((i + 1) / images.length) * 60));
        setCurrentStep(`Creating image ${i + 1}/${images.length}...`);
      }

      setCurrentStep('Combining segments...');
      setProgress(85);

      // Create concat list
      let concatList = '';
      for (let i = 0; i < images.length; i++) {
        concatList += `file 'segment${i}.mp4'\n`;
      }
      await ffmpeg.writeFile('concat.txt', new TextEncoder().encode(concatList));

      // Concatenate all segments
      const concatArgs = [
        '-f', 'concat',
        '-safe', '0',
        '-i', 'concat.txt',
        '-c', 'copy',
        '-y',
        'output.mp4'
      ];

      await ffmpeg.exec(concatArgs);
      setProgress(95);

      setCurrentStep('Finalizing...');

      // Read and set the output
      const fileData = await ffmpeg.readFile('output.mp4');
      const uint8Array = new Uint8Array(fileData);
      const blob = new Blob([uint8Array], { type: 'video/mp4' });
      const url = URL.createObjectURL(blob);
      setPreviewUrl(url);
      setDownloadUrl(url);
    }
  };

  const calculateRequiredLoops = () => {
    if (!audioDuration || !images.length) return 1;
    const totalImageDuration = images.length * duration;
    return Math.ceil(audioDuration / totalImageDuration);
  };

  const getTotalDuration = () => {
    if (audio) {
      return audioDuration;
    }
    return images.length * duration;
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-gray-950 via-gray-900 to-black text-white p-6 font-sans relative overflow-hidden">
      <div className="absolute inset-0 -z-10 animate-pulse bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-purple-900/30 via-black to-black" />

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="w-full max-w-4xl bg-gray-900/80 backdrop-blur-lg border border-gray-800 shadow-2xl rounded-3xl p-8"
      >
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold tracking-tight flex justify-center items-center gap-3">
            <Film className="w-8 h-8 text-purple-400" /> Ultra Slideshow Generator
          </h1>
          <p className="text-gray-400 mt-2">
            {audio 
              ? `Video will match audio length exactly (${audioDuration > 0 ? Math.round(audioDuration) + 's' : 'calculating...'})` 
              : `${images.length} images × ${duration}s = ${images.length * duration}s total`
            }
          </p>
          {audio && audioDuration > 0 && images.length > 0 && (
            <div className="text-sm text-purple-400 mt-1 space-y-1">
              <p>Images will loop {calculateRequiredLoops()} time{calculateRequiredLoops() !== 1 ? 's' : ''}</p>
              <p className="text-gray-400">
                Each loop: {images.length} images × {duration}s = {images.length * duration}s
              </p>
            </div>
          )}
        </div>

        {!isLoaded && !error && (
          <div className="text-center py-4">
            <Loader2 className="w-6 h-6 animate-spin mx-auto text-purple-400" />
            <p className="text-gray-400 mt-2">Loading video engine...</p>
          </div>
        )}

        {error && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="bg-red-900/50 border border-red-700 rounded-lg p-4 mb-4"
          >
            <p className="text-red-200">{error}</p>
            <button
              onClick={() => setError(null)}
              className="mt-2 text-red-300 hover:text-red-100 text-sm"
            >
              Dismiss
            </button>
          </motion.div>
        )}

        <div className="flex flex-col gap-6">
          <div>
            <div 
              onClick={triggerImageInput}
              className="border-2 border-dashed border-gray-700 rounded-xl p-6 text-center cursor-pointer hover:border-purple-500 transition group"
            >
              <div className="flex flex-col items-center text-gray-400 group-hover:text-purple-400">
                <Upload className="w-6 h-6 mb-2" /> 
                {images.length === 0 ? 'Upload Images' : 'Add More Images'}
                <span className="text-sm mt-1">({images.length}/8 selected)</span>
              </div>
              <input 
                ref={imageInputRef}
                type="file" 
                accept="image/*" 
                multiple 
                hidden 
                onChange={handleImageUpload} 
              />
            </div>
            
            {imagePreviews.length > 0 && (
              <div className="mt-4">
                <div className="flex justify-between items-center mb-2">
                  <h3 className="text-sm font-medium text-gray-400">Selected Images:</h3>
                  <button
                    onClick={clearAllImages}
                    className="text-red-400 hover:text-red-300 text-sm flex items-center gap-1"
                  >
                    <X className="w-4 h-4" /> Clear All
                  </button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {imagePreviews.map((preview, index) => (
                    <div key={index} className="relative group">
                      <img
                        src={preview}
                        alt={`Preview ${index + 1}`}
                        className="w-full h-24 object-cover rounded-lg border border-gray-600"
                      />
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeImage(index);
                        }}
                        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="w-3 h-3" />
                      </button>
                      <div className="absolute bottom-1 right-1 bg-black/50 rounded px-1 text-xs">
                        {index + 1}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div>
            <div 
              onClick={triggerAudioInput}
              className="border-2 border-dashed border-gray-700 rounded-xl p-6 text-center cursor-pointer hover:border-pink-500 transition group"
            >
              <div className="flex flex-col items-center text-gray-400 group-hover:text-pink-400">
                <Music className="w-6 h-6 mb-2" /> 
                Upload Background Music (optional)
                {audio && (
                  <span className="text-sm mt-1 text-green-400">
                    ✓ Audio: {audioDuration > 0 ? Math.round(audioDuration) + 's' : 'Calculating...'}
                  </span>
                )}
              </div>
              <input 
                ref={audioInputRef}
                type="file" 
                accept="audio/*" 
                hidden 
                onChange={handleAudioUpload} 
              />
            </div>
            
            {audioPreview && audio && (
              <div className="mt-4 p-4 bg-gray-800/50 rounded-lg border border-gray-700">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Music className="w-5 h-5 text-pink-400" />
                    <div>
                      <p className="text-sm font-medium">{audio.name}</p>
                      <p className="text-xs text-gray-400">
                        {(audio.size / (1024 * 1024)).toFixed(2)} MB
                        {audioDuration > 0 && ` • ${Math.round(audioDuration)} seconds`}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={removeAudio}
                    className="text-red-400 hover:text-red-300 transition"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <audio 
                  controls 
                  className="w-full mt-3"
                  onLoadedMetadata={(e) => {
                    setAudioDuration(e.currentTarget.duration);
                  }}
                >
                  <source src={audioPreview} type={audio.type} />
                  Your browser does not support the audio element.
                </audio>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col items-center">
              <span className="text-sm text-gray-400 mb-2 flex items-center gap-2">
                <Film className="w-4 h-4" /> Transition Effect
              </span>
              <select
                value={effect}
                onChange={(e) => setEffect(e.target.value as any)}
                className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-4 py-2 focus:ring-2 focus:ring-purple-600 focus:outline-none"
              >
                <option value="smooth">Ultra Smooth Zoom</option>
                <option value="zoom">Gentle Zoom In</option>
                <option value="zoomout">Gentle Zoom Out</option>
                <option value="pan">Smooth Pan</option>
                <option value="fade">Fade Transition</option>
                <option value="slide">Slide Transition</option>
              </select>
              <p className="text-xs text-gray-500 mt-1 text-center">
                {effect === 'smooth' && 'Ultra smooth subtle zoom with 30fps'}
                {effect === 'zoom' && 'Gentle zoom in effect'}
                {effect === 'zoomout' && 'Gentle zoom out effect'}
                {effect === 'pan' && 'Smooth horizontal pan movement'}
                {effect === 'fade' && 'Smooth fade between images'}
                {effect === 'slide' && 'Smooth slide transition'}
              </p>
            </div>

            <div className="flex flex-col items-center">
              <span className="text-sm text-gray-400 mb-2 flex items-center gap-2">
                <Clock className="w-4 h-4" /> Duration per Image
              </span>
              <div className="flex items-center gap-3 w-full">
                <input
                  type="range"
                  min="1"
                  max="10"
                  step="0.5"
                  value={duration}
                  onChange={(e) => setDuration(parseFloat(e.target.value))}
                  className="flex-1 accent-purple-600"
                />
                <span className="text-white font-semibold min-w-[3rem] text-center bg-gray-800 px-3 py-1 rounded-lg border border-gray-700">
                  {duration}s
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-1 text-center">
                Each image shows for {duration} second{duration !== 1 ? 's' : ''}
                {audio && images.length > 0 && (
                  <span className="block text-purple-400">
                    Total video: {Math.round(getTotalDuration())}s
                  </span>
                )}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-8 flex flex-col items-center">
          <button
            onClick={generateSlideshow}
            disabled={isGenerating || !images.length || !isLoaded || (audio && audioDuration === 0)}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 text-white font-semibold hover:opacity-90 disabled:opacity-50 transition flex items-center justify-center gap-2"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" /> Generating... {progress}%
              </>
            ) : (
              `Generate Slideshow ${images.length ? `(${images.length} images)` : ''}`
            )}
          </button>

          <AnimatePresence>
            {isGenerating && (
              <motion.div
                key="progress"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="w-full mt-4"
              >
                <div className="w-full h-3 bg-gray-800 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-gradient-to-r from-purple-500 to-blue-500"
                    style={{ width: `${progress}%` }}
                    transition={{ ease: 'easeOut', duration: 0.3 }}
                  />
                </div>
                <p className="text-center text-sm text-gray-400 mt-2">
                  {currentStep} ({progress}%)
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {downloadUrl && !isGenerating && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-6 w-full"
            >
              {showPreview && previewUrl && (
                <div className="mb-6 bg-gray-800/50 rounded-xl p-4 border border-gray-700">
                  <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                    <Film className="w-5 h-5 text-purple-400" />
                    Preview Your Slideshow
                  </h3>
                  <video 
                    controls 
                    className="w-full rounded-lg shadow-lg"
                    preload="metadata"
                  >
                    <source src={previewUrl} type="video/mp4" />
                    Your browser does not support the video tag.
                  </video>
                  <p className="text-sm text-gray-400 mt-3 text-center">
                    {audio && (
                      <span className="text-green-400 block mb-1">
                        ✓ Perfectly synced with {Math.round(audioDuration)}s audio
                      </span>
                    )}
                    Review your video above, then download when ready!
                  </p>
                </div>
              )}
              
              <div className="text-center">
                <a
                  href={downloadUrl}
                  download="slideshow.mp4"
                  className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 px-6 py-3 rounded-xl font-semibold text-white transition shadow-lg"
                >
                  <Download className="w-5 h-5" /> Download MP4
                </a>
                <p className="text-sm text-gray-400 mt-2">
                  Your slideshow is ready! Click to download.
                </p>
              </div>
            </motion.div>
          )}
        </div>
      </motion.div>

      <motion.footer className="mt-10 text-gray-500 text-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        Built with ❤️ using FFmpeg & React
      </motion.footer>
    </div>
  );
}