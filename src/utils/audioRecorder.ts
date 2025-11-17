import lamejs from 'lamejs';

export class AudioRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private dataArray: Uint8Array | null = null;
  private animationId: number | null = null;

  constructor(
    private onVisualize?: (dataArray: Uint8Array) => void
  ) {}

  async start(): Promise<void> {
    try {
      console.log('Requesting microphone access...');
      
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 44100,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      console.log('Microphone access granted');

      // Set up audio context for visualization
      this.audioContext = new AudioContext();
      const source = this.audioContext.createMediaStreamSource(this.stream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 2048;
      
      source.connect(this.analyser);
      
      const bufferLength = this.analyser.frequencyBinCount;
      this.dataArray = new Uint8Array(bufferLength);

      // Start visualization
      if (this.onVisualize) {
        this.visualize();
      }

      // Set up MediaRecorder
      const mimeType = this.getSupportedMimeType();
      console.log('Using MIME type:', mimeType);
      
      this.mediaRecorder = new MediaRecorder(this.stream, {
        mimeType,
        audioBitsPerSecond: 128000
      });

      this.audioChunks = [];

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          console.log('Audio chunk received:', event.data.size, 'bytes');
          this.audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.start(100); // Collect data every 100ms
      console.log('Recording started');
    } catch (error) {
      console.error('Error starting recording:', error);
      throw error;
    }
  }

  private getSupportedMimeType(): string {
    const types = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/mp4'
    ];

    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }

    return '';
  }

  private visualize(): void {
    if (!this.analyser || !this.dataArray || !this.onVisualize) return;

    const animate = () => {
      this.animationId = requestAnimationFrame(animate);
      
      if (this.analyser && this.dataArray && this.onVisualize) {
        const data = new Uint8Array(this.dataArray.length);
        this.analyser.getByteTimeDomainData(data);
        this.onVisualize(data);
      }
    };

    animate();
  }

  async stop(): Promise<Blob> {
    console.log('Stopping recording...');
    
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder) {
        reject(new Error('No recording in progress'));
        return;
      }

      this.mediaRecorder.onstop = async () => {
        console.log('Recording stopped, processing audio...');
        
        // Stop visualization
        if (this.animationId) {
          cancelAnimationFrame(this.animationId);
        }

        // Clean up audio context
        if (this.audioContext) {
          await this.audioContext.close();
          this.audioContext = null;
        }

        // Stop all tracks
        if (this.stream) {
          this.stream.getTracks().forEach(track => track.stop());
          this.stream = null;
        }

        try {
          // Create blob from chunks
          const webmBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
          console.log('Created WebM blob:', webmBlob.size, 'bytes');

          // Convert to MP3
          const mp3Blob = await this.convertToMp3(webmBlob);
          console.log('Converted to MP3:', mp3Blob.size, 'bytes');
          
          resolve(mp3Blob);
        } catch (error) {
          console.error('Error processing audio:', error);
          reject(error);
        }
      };

      this.mediaRecorder.stop();
    });
  }

  private async convertToMp3(webmBlob: Blob): Promise<Blob> {
    console.log('Converting to MP3...');
    
    // Decode webm to PCM
    const arrayBuffer = await webmBlob.arrayBuffer();
    const audioContext = new AudioContext();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    
    console.log('Audio decoded:', audioBuffer.duration, 'seconds');

    // Get PCM data
    const channelData = audioBuffer.getChannelData(0);
    const samples = new Int16Array(channelData.length);
    
    // Convert float32 to int16
    for (let i = 0; i < channelData.length; i++) {
      const s = Math.max(-1, Math.min(1, channelData[i]));
      samples[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }

    console.log('PCM data prepared, encoding to MP3...');

    // Encode to MP3
    const mp3encoder = new lamejs.Mp3Encoder(1, audioBuffer.sampleRate, 128);
    const mp3Data: BlobPart[] = [];
    
    const sampleBlockSize = 1152;
    for (let i = 0; i < samples.length; i += sampleBlockSize) {
      const sampleChunk = samples.subarray(i, i + sampleBlockSize);
      const mp3buf = mp3encoder.encodeBuffer(sampleChunk);
      if (mp3buf.length > 0) {
        mp3Data.push(mp3buf);
      }
    }
    
    // Finalize encoding
    const mp3buf = mp3encoder.flush();
    if (mp3buf.length > 0) {
      mp3Data.push(mp3buf);
    }

    console.log('MP3 encoding complete');

    // Create blob
    const mp3Blob = new Blob(mp3Data, { type: 'audio/mp3' });
    
    await audioContext.close();
    
    return mp3Blob;
  }

  isRecording(): boolean {
    return this.mediaRecorder?.state === 'recording';
  }
}

export const downloadAudio = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  console.log('Download initiated:', filename);
};
