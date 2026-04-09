/**
 * Audio Extraction Service
 * Extracts audio from video streams for STT processing
 */

import ffmpeg from 'fluent-ffmpeg';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { AudioExtractionResult } from '../types/index.js';

export class AudioExtractionService {
  private tempDir: string;

  constructor() {
    this.tempDir = os.tmpdir();
  }

  async extractAudioFromVideo(
    videoPath: string,
    options: {
      startTime?: number;
      duration?: number;
      format?: 'wav' | 'mp3' | 'ogg';
      sampleRate?: number;
      channels?: number;
    } = {}
  ): Promise<AudioExtractionResult> {
    const {
      startTime = 0,
      duration,
      format = 'wav',
      sampleRate = 16000,
      channels = 1
    } = options;

    const outputPath = path.join(this.tempDir, `audio_${Date.now()}.${format}`);

    return new Promise((resolve, reject) => {
      let command = ffmpeg(videoPath)
        .audioFrequency(sampleRate)
        .audioChannels(channels)
        .audioCodec(format === 'wav' ? 'pcm_s16le' : 'libmp3lame')
        .output(outputPath);

      if (startTime > 0) {
        command = command.setStartTime(startTime);
      }

      if (duration) {
        command = command.duration(duration);
      }

      command
        .on('start', (cmd) => {
          console.log(`🎵 Starte Audio-Extraktion: ${cmd}`);
        })
        .on('progress', (progress) => {
          if (progress.percent) {
            console.log(`📊 Extraktions-Fortschritt: ${Math.round(progress.percent)}%`);
          }
        })
        .on('end', async () => {
          try {
            const audioBuffer = await fs.readFile(outputPath);
            const stats = await fs.stat(outputPath);
            
            await fs.unlink(outputPath).catch(() => {});

            resolve({
              audioBuffer,
              sampleRate,
              duration: duration || 0,
              channels,
              format
            });
          } catch (error) {
            reject(error);
          }
        })
        .on('error', (err) => {
          console.error('❌ FFmpeg Fehler:', err.message);
          reject(err);
        })
        .run();
    });
  }

  async extractAudioFromFrameBuffer(
    buffer: Buffer,
    options: {
      format?: 'wav' | 'mp3';
      sampleRate?: number;
    } = {}
  ): Promise<AudioExtractionResult> {
    const { format = 'wav', sampleRate = 16000 } = options;
    
    const inputPath = path.join(this.tempDir, `input_${Date.now()}.raw`);
    const outputPath = path.join(this.tempDir, `audio_${Date.now()}.${format}`);

    try {
      await fs.writeFile(inputPath, buffer);

      return new Promise((resolve, reject) => {
        ffmpeg(inputPath)
          .audioFrequency(sampleRate)
          .audioChannels(1)
          .audioCodec('pcm_s16le')
          .output(outputPath)
          .on('end', async () => {
            try {
              const audioBuffer = await fs.readFile(outputPath);
              await fs.unlink(inputPath).catch(() => {});
              await fs.unlink(outputPath).catch(() => {});

              resolve({
                audioBuffer,
                sampleRate,
                duration: 0,
                channels: 1,
                format
              });
            } catch (error) {
              reject(error);
            }
          })
          .on('error', reject)
          .run();
      });
    } catch (error) {
      await fs.unlink(inputPath).catch(() => {});
      throw error;
    }
  }

  async captureAudioSegment(
    sessionId: string,
    startTimeSec: number,
    durationSec: number
  ): Promise<Buffer> {
    console.log(`🎤 Erfasse Audio-Segment: ${startTimeSec}s - ${startTimeSec + durationSec}s`);
    
    return Buffer.alloc(0);
  }
}

export default AudioExtractionService;