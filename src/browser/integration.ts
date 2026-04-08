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
        video: 'video, iframe[src*="player"], .video-player video, .player video, #player video',
        playButton: '[data-testid="play-button"], .ytp-play-button, .play-button, .play-btn, .btn-play',
        progressBar: '.ytp-progress-bar, .progress-bar, .seek-bar, .progress',
        subtitle: '.ytp-caption-segment, .subtitle, .caption, .subtitle-text, .captions'
      },
      platform: 'aniworld'
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

      // Automatisch den Play-Button klicken
      await this.startVideo();

      console.log('✅ Navigation erfolgreich!');
    } catch (error) {
      console.error('❌ Fehler bei der Navigation:', error);
      throw error;
    }
  }

  private async startVideo(): Promise<void> {
    if (!this.page) {
      return;
    }

    try {
      console.log('▶️ Suche nach AniWorld Webplayer...');
      
      // Warte auf das Laden der Seite
      await this.page.waitForTimeout(3000);

      // Scroll nur ein kleines Stück runter zum Player
      console.log('📜 Scrolle runter zum Player...');
      await this.page.evaluate(() => {
        window.scrollTo(0, 300); // Kleines Stück runter zum Player-Bereich
      });
      await this.page.waitForTimeout(2000);

      // Klicke auf den iframe oder fakePlayer in der Mitte
      console.log('🎬 Klicke auf den Player-Bereich...');
      
      // Klicke auf den iframe oder fakePlayer
      const playerSelectors = [
        'iframe[src*="redirect"]',
        '.fakePlayer',
        '.inSiteWebStream',
        '.hosterSiteVideo'
      ];

      for (const selector of playerSelectors) {
        try {
          const player = await this.page.$(selector);
          if (player) {
            console.log(`✅ Player-Bereich gefunden: ${selector}`);
            await player.click();
            console.log('▶️ Video gestartet!');
            await this.page.waitForTimeout(3000);
            return;
          }
        } catch (error) {
          // Ignoriere Fehler bei einzelnen Selektoren
        }
      }

      // Fallback: Klicke in die Mitte des Player-Bereichs
      console.log('🎯 Klicke in die Mitte des Player-Bereichs...');
      await this.page.click('body', { offset: { x: 500, y: 300 } });
      console.log('▶️ Video gestartet!');
      await this.page.waitForTimeout(3000);
    } catch (error) {
      console.log('⚠️ Fehler beim Starten des Videos:', error);
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
      await this.page.waitForTimeout(2000);

      // Versuche verschiedene Video-Selektoren
      let videoElement = null;
      const videoSelectors = [
        'video',
        'iframe[src*="player"]',
        '.video-player video',
        '.player video',
        '#player video',
        '.stream-player video',
        '.anime-player video'
      ];

      for (const selector of videoSelectors) {
        try {
          videoElement = await this.page.$(selector);
          if (videoElement) {
            console.log(`✅ Video-Element gefunden mit Selektor: ${selector}`);
            break;
          }
        } catch (error) {
          // Ignoriere Fehler bei einzelnen Selektoren
        }
      }

      if (!videoElement) {
        // Fallback: Screenshot der gesamten Seite
        console.log('⚠️ Kein Video-Element gefunden, mache Screenshot der gesamten Seite');
        const screenshot = await this.page.screenshot({
          encoding: 'base64',
          fullPage: false
        });

        const now = Date.now();
        const frameData: FrameData = {
          id: `frame_${now}`,
          movieId: 'unknown',
          capturedAtWallTimeMs: now,
          timestamp: now,
          imageData: screenshot as string,
          width: 1920,
          height: 1080,
          extractedAt: new Date()
        };

        console.log('✅ Screenshot der Seite erfasst!');
        return frameData;
      }

      const screenshot = await videoElement.screenshot({
        encoding: 'base64'
      });

      const now = Date.now();
      const videoTimeSec = await this.page.evaluate((selectors: WebPlayerConfig['selectors']) => {
        const video = document.querySelector(selectors.video) as HTMLVideoElement | null;
        return video?.currentTime ?? undefined;
      }, this.playerConfig.selectors);

      const frameData: FrameData = {
        id: `frame_${now}`,
        movieId: 'unknown',
        capturedAtWallTimeMs: now,
        ...(videoTimeSec !== undefined ? { videoTimeSec } : {}),
        timestamp: now,
        imageData: screenshot as string,
        width: 1920,
        height: 1080,
        extractedAt: new Date(),
        ...(videoTimeSec !== undefined ? { videoTimebase: { fps: 30, frameDurationMs: 1000 / 30 } } : {})
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
      
      const subtitles = await this.page.evaluate((selectors: WebPlayerConfig['selectors']) => {
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
      
      const state = await this.page.evaluate((selectors: WebPlayerConfig['selectors']) => {
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
