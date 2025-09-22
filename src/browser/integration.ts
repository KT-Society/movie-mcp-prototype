import puppeteer, { Browser, Page } from 'puppeteer';
import { BrowserMCPConfig, WebPlayerConfig, FrameData, SubtitleData, PlaybackState } from '../types';

export class BrowserMCPIntegration {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private config: BrowserMCPConfig;
  private playerConfig: WebPlayerConfig;

  constructor(config: BrowserMCPConfig) {
    this.config = config;
    this.playerConfig = {
      selectors: {
        video: 'video',
        playButton: '[data-testid="play-button"], .ytp-play-button, .play-button',
        progressBar: '.ytp-progress-bar, .progress-bar',
        subtitle: '.ytp-caption-segment, .subtitle, .caption'
      },
      platform: 'youtube'
    };
  }

  async initialize(): Promise<void> {
    try {
      console.log('🚀 Starte Browser MCP Integration...');
      
      // Versuche zuerst mit deinem echten Chrome zu verbinden
      try {
        this.browser = await puppeteer.connect({
          browserURL: 'http://localhost:9222'
        });
        console.log('✅ Verbunden mit laufendem Chrome!');
      } catch (error) {
        console.log('⚠️ Kein laufendes Chrome gefunden, starte neues...');
        this.browser = await puppeteer.launch({
          headless: this.config.headless,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu'
          ]
        });
      }

      this.page = await this.browser.newPage();
      
      console.log('✅ Browser MCP Integration initialisiert!');
    } catch (error) {
      console.error('❌ Fehler beim Initialisieren der Browser MCP Integration:', error);
      throw error;
    }
  }

  async navigateToUrl(url: string): Promise<void> {
    if (!this.page) {
      throw new Error('Browser nicht initialisiert');
    }

    try {
      console.log(`🌐 Navigiere zu: ${url}`);
      
      await this.page.goto(url, {
        waitUntil: 'networkidle2',
        timeout: this.config.timeout
      });

      // Cookie-Banner automatisch wegklicken
      await this.handleCookieBanners();

      console.log('✅ Navigation erfolgreich!');
    } catch (error) {
      console.error('❌ Fehler bei der Navigation:', error);
      throw error;
    }
  }

  private async handleCookieBanners(): Promise<void> {
    if (!this.page) {
      return;
    }

    try {
      console.log('🍪 Suche nach Cookie-Bannern...');
      
      // Warte kurz auf das Laden der Seite
      await this.page.waitForTimeout(2000);

      // Verschiedene Cookie-Banner-Buttons suchen
      const cookieSelectors = [
        'button[aria-label*="Alle akzeptieren"]',
        'button[aria-label*="Accept all"]',
        'button:has-text("Alle akzeptieren")',
        'button:has-text("Accept all")',
        'button:has-text("Alle zulassen")',
        'button:has-text("Allow all")',
        '[data-testid*="accept"]',
        '[data-testid*="allow"]',
        '.cookie-accept',
        '.accept-cookies',
        '#accept-cookies',
        '#cookie-accept'
      ];

      for (const selector of cookieSelectors) {
        try {
          const button = await this.page.$(selector);
          if (button) {
            console.log(`✅ Cookie-Button gefunden: ${selector}`);
            await button.click();
            console.log('✅ Cookie-Banner weggeklickt!');
            await this.page.waitForTimeout(1000);
            return;
          }
        } catch (error) {
          // Ignoriere Fehler bei einzelnen Selektoren
        }
      }

      // Fallback: Text-basierte Suche
      const textButtons = await this.page.$$('button');
      for (const button of textButtons) {
        try {
          const text = await button.evaluate(el => el.textContent);
          if (text && (
            text.includes('Alle akzeptieren') ||
            text.includes('Accept all') ||
            text.includes('Alle zulassen') ||
            text.includes('Allow all') ||
            text.includes('Akzeptieren') ||
            text.includes('Accept')
          )) {
            console.log(`✅ Cookie-Button per Text gefunden: ${text}`);
            await button.click();
            console.log('✅ Cookie-Banner weggeklickt!');
            await this.page.waitForTimeout(1000);
            return;
          }
        } catch (error) {
          // Ignoriere Fehler bei einzelnen Buttons
        }
      }

      console.log('ℹ️ Kein Cookie-Banner gefunden oder bereits weggeklickt');
    } catch (error) {
      console.log('⚠️ Fehler beim Umgang mit Cookie-Bannern:', error);
    }
  }



  async captureFrame(): Promise<FrameData> {
    if (!this.page) {
      throw new Error('Browser nicht initialisiert');
    }

    try {
      console.log('📸 Erfasse Frame...');
      
      // Warte auf das Laden der Seite
      await this.page.waitForTimeout(1000);

      // Screenshot des Video-Elements
      const videoElement = await this.page.$(this.playerConfig.selectors.video);
      if (!videoElement) {
        throw new Error('Video-Element nicht gefunden');
      }

      const screenshot = await videoElement.screenshot({
        encoding: 'base64'
      });

      const frameData: FrameData = {
        id: `frame_${Date.now()}`,
        movieId: 'unknown',
        timestamp: Date.now(),
        imageData: screenshot as string,
        width: 3840,
        height: 2160,
        extractedAt: new Date()
      };

      console.log('✅ Frame erfasst!');
      return frameData;
    } catch (error) {
      console.error('❌ Fehler beim Erfassen des Frames:', error);
      throw error;
    }
  }

  async getSubtitles(): Promise<SubtitleData[]> {
    if (!this.page) {
      throw new Error('Browser nicht initialisiert');
    }

    try {
      console.log('📝 Extrahiere Untertitel...');
      
      const subtitles = await this.page.evaluate((selectors) => {
        const subtitleElements = document.querySelectorAll(selectors.subtitle);
        const subtitleData: SubtitleData[] = [];

        subtitleElements.forEach((element, index) => {
          const text = element.textContent?.trim();
          if (text) {
            subtitleData.push({
              id: `subtitle_${index}`,
              movieId: 'unknown',
              text: text,
              startTime: 0, // Wird später berechnet
              endTime: 0,   // Wird später berechnet
              language: 'de',
              extractedAt: new Date()
            });
          }
        });

        return subtitleData;
      }, this.playerConfig.selectors);

      console.log(`✅ ${subtitles.length} Untertitel extrahiert!`);
      return subtitles;
    } catch (error) {
      console.error('❌ Fehler beim Extrahieren der Untertitel:', error);
      return [];
    }
  }

  async getPlaybackState(): Promise<PlaybackState> {
    if (!this.page) {
      throw new Error('Browser nicht initialisiert');
    }

    try {
      console.log('▶️ Ermittle Playback-Status...');
      
      const state = await this.page.evaluate((selectors) => {
        const video = document.querySelector(selectors.video) as HTMLVideoElement;
        if (!video) {
          return {
            movieId: 'unknown',
            timestamp: new Date(),
            isPlaying: false,
            currentTime: 0,
            duration: 0,
            volume: 0,
            playbackRate: 1
          };
        }

        return {
          movieId: 'unknown',
          timestamp: new Date(),
          isPlaying: !video.paused,
          currentTime: video.currentTime,
          duration: video.duration,
          volume: video.volume,
          playbackRate: video.playbackRate
        };
      }, this.playerConfig.selectors);

      console.log('✅ Playback-Status ermittelt!');
      return state;
    } catch (error) {
      console.error('❌ Fehler beim Ermitteln des Playback-Status:', error);
      return {
        movieId: 'unknown',
        timestamp: new Date(),
        isPlaying: false,
        currentTime: 0,
        duration: 0,
        volume: 0,
        playbackRate: 1
      };
    }
  }

  async cleanup(): Promise<void> {
    try {
      if (this.browser) {
        console.log('🔒 Schließe Browser...');
        await this.browser.close();
        this.browser = null;
        this.page = null;
        console.log('✅ Browser geschlossen!');
      }
    } catch (error) {
      console.error('❌ Fehler beim Schließen des Browsers:', error);
    }
  }

  isInitialized(): boolean {
    return this.browser !== null && this.page !== null;
  }

  getPage(): Page | null {
    return this.page;
  }

  getBrowser(): Browser | null {
    return this.browser;
  }
}