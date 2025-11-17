import { useEffect, useRef } from "react";

interface WaveformVisualizerProps {
  dataArray: Uint8Array | null;
  isRecording: boolean;
}

const WaveformVisualizer = ({ dataArray, isRecording }: WaveformVisualizerProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current || !dataArray || !isRecording) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    const width = canvas.width;
    const height = canvas.height;

    // Clear canvas
    ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
    ctx.fillRect(0, 0, width, height);

    // Draw waveform
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'hsl(180, 60%, 55%)';
    ctx.beginPath();

    const sliceWidth = width / dataArray.length;
    let x = 0;

    for (let i = 0; i < dataArray.length; i++) {
      const v = dataArray[i] / 128.0;
      const y = (v * height) / 2;

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }

      x += sliceWidth;
    }

    ctx.lineTo(width, height / 2);
    ctx.stroke();

    // Draw frequency bars
    ctx.fillStyle = 'hsl(270, 60%, 65%)';
    const barWidth = width / dataArray.length * 2.5;
    
    for (let i = 0; i < dataArray.length; i += 4) {
      const barHeight = (dataArray[i] / 255) * height * 0.8;
      const x = (i / 4) * barWidth;
      const y = height - barHeight;
      
      ctx.fillRect(x, y, barWidth - 1, barHeight);
    }
  }, [dataArray, isRecording]);

  return (
    <canvas
      ref={canvasRef}
      width={800}
      height={200}
      className="w-full h-full"
      style={{ imageRendering: 'pixelated' }}
    />
  );
};

export default WaveformVisualizer;
