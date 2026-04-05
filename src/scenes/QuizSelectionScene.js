import Phaser from 'phaser';
import { DATA_CACHE_KEYS } from './PreloadScene.js';
import { OVERLAY_STYLE, PALETTE } from '../ui/styles.js';

const CARD_PADDING_X = 20;
const CARD_PADDING_Y = 14;
const CARD_GAP = 12;
const CARD_RADIUS = 8;
const CARD_WIDTH_FRACTION = 0.86;
const MAX_CARD_WIDTH = 440;
const LIST_BOTTOM_MARGIN = 24;
const WHEEL_SCROLL_FACTOR = 0.8;
const SCROLL_DRAG_THRESHOLD = 8;

const CARD_COLOR_NORMAL = 0x1e3a5f;
const CARD_COLOR_HOVER = 0x2a5080;
const CARD_COLOR_ACTIVE = 0x1a3358;
const TITLE_COLOR = '#0f172a';
const SUBTITLE_COLOR = '#334155';
const NAME_COLOR = '#f8fafc';
const DESC_COLOR = '#94a3b8';

export default class QuizSelectionScene extends Phaser.Scene {
  constructor() {
    super('QuizSelectionScene');
    this._cards = [];
    this._quizSets = [];
    this._listContainer = null;
    this._listMaskGraphics = null;
    this._listTop = 0;
    this._listHeight = 0;
    this._listLeft = 0;
    this._listWidth = 0;
    this._scrollOffset = 0;
    this._contentHeight = 0;
    this._scrollPointerId = null;
    this._scrollLastY = 0;
    this._scrollDistance = 0;
  }

  create() {
    const { width, height } = this.scale;

    this.cameras.main.setBackgroundColor(PALETTE.water);

    const quizSetsData = this.cache.json.get(DATA_CACHE_KEYS.QUIZ_SETS);
    this._quizSets = quizSetsData?.sets ?? [];

    this._buildUI(this._quizSets, width, height);

    this.input.on('wheel', this._handleWheel, this);
    this.input.on('pointerdown', this._handlePointerDown, this);
    this.input.on('pointermove', this._handlePointerMove, this);
    this.input.on('pointerup', this._handlePointerUp, this);
    this.input.on('pointerupoutside', this._handlePointerUp, this);
    this.scale.on(Phaser.Scale.Events.RESIZE, this._handleResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this._handleShutdown, this);
  }

  _buildUI(sets, width, height) {
    this.children.removeAll(true);
    this._cards = [];
    this._listContainer = null;
    this._listMaskGraphics = null;
    this._scrollOffset = 0;
    this._contentHeight = 0;
    this._scrollPointerId = null;
    this._scrollLastY = 0;
    this._scrollDistance = 0;

    const cardWidth = Math.min(
      Math.round(width * CARD_WIDTH_FRACTION),
      MAX_CARD_WIDTH,
    );
    const cardLeft = Math.round((width - cardWidth) * 0.5);

    // Title
    const titleY = 28;
    this.add
      .text(width * 0.5, titleY, 'Kies een quiz', {
        fontFamily: OVERLAY_STYLE.FONT_FAMILY,
        fontSize: '22px',
        color: TITLE_COLOR,
        fontStyle: 'bold',
      })
      .setOrigin(0.5, 0);

    this.add
      .text(width * 0.5, titleY + 34, 'Selecteer een onderwerp om te starten', {
        fontFamily: OVERLAY_STYLE.FONT_FAMILY,
        fontSize: '13px',
        color: SUBTITLE_COLOR,
      })
      .setOrigin(0.5, 0);

    this._listTop = titleY + 80;
    this._listHeight = Math.max(140, height - this._listTop - LIST_BOTTOM_MARGIN);
    this._listLeft = cardLeft;
    this._listWidth = cardWidth;
    this._listContainer = this.add.container(0, this._listTop);
    this._listMaskGraphics = this.add.graphics();
    this._listMaskGraphics.fillStyle(0xffffff, 1);
    this._listMaskGraphics.fillRect(
      this._listLeft,
      this._listTop,
      this._listWidth,
      this._listHeight,
    );
    this._listContainer.setMask(this._listMaskGraphics.createGeometryMask());

    let cursorY = 0;

    for (const quizSet of sets) {
      cursorY = this._createCard(quizSet, cardLeft, cursorY, cardWidth);
      cursorY += CARD_GAP;
    }

    this._contentHeight = Math.max(cursorY - CARD_GAP, 0);
    this._applyScrollOffset(0);
  }

  _createCard(quizSet, x, y, cardWidth) {
    const nameFontSize = '16px';
    const descFontSize = '12px';
    const countFontSize = '12px';

    // Measure name text height (single line)
    const nameHeight = 22;
    const descText = quizSet.description ?? '';
    const descWrappedLines = Math.ceil(descText.length / 44) || 1;
    const descHeight = descWrappedLines * 16 + 4;
    const countHeight = 16;

    const innerHeight =
      nameHeight + descHeight + countHeight + CARD_PADDING_Y * 2 + 8;

    const bg = this.add.graphics();
    this._drawCardBackground(bg, cardWidth, innerHeight, CARD_COLOR_NORMAL);

    const nameLabel = this.add.text(CARD_PADDING_X, CARD_PADDING_Y, quizSet.name ?? '', {
      fontFamily: OVERLAY_STYLE.FONT_FAMILY,
      fontSize: nameFontSize,
      color: NAME_COLOR,
      fontStyle: 'bold',
    });

    const descLabel = this.add
      .text(CARD_PADDING_X, CARD_PADDING_Y + nameHeight + 6, descText, {
        fontFamily: OVERLAY_STYLE.FONT_FAMILY,
        fontSize: descFontSize,
        color: DESC_COLOR,
        wordWrap: { width: cardWidth - CARD_PADDING_X * 2, useAdvancedWrap: false },
      });

    const targetCount = (quizSet.targets ?? []).length;
    const countLabel = this.add.text(
      CARD_PADDING_X,
      CARD_PADDING_Y + nameHeight + descHeight + 10,
      `${targetCount} doelen`,
      {
        fontFamily: OVERLAY_STYLE.FONT_FAMILY,
        fontSize: countFontSize,
        color: '#64748b',
      },
    );

    const container = this.add.container(x, y, [bg, nameLabel, descLabel, countLabel]);
    this._listContainer.add(container);

    // Hit zone
    const zone = this.add
      .zone(x, y, cardWidth, innerHeight)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: true });
    this._listContainer.add(zone);

    const cardState = {
      container,
      zone,
      quizSet,
      pointerId: null,
      setColor: (color) => this._drawCardBackground(bg, cardWidth, innerHeight, color),
      clearPress: () => {
        cardState.pointerId = null;
        cardState.setColor(CARD_COLOR_NORMAL);
      },
    };

    zone.on('pointerover', () => {
      if (cardState.pointerId === null) {
        cardState.setColor(CARD_COLOR_HOVER);
      }
    });

    zone.on('pointerout', () => {
      cardState.clearPress();
    });

    zone.on('pointerdown', (pointer) => {
      cardState.pointerId = pointer.id;
      cardState.setColor(CARD_COLOR_ACTIVE);
    });

    zone.on('pointerup', (pointer) => {
      const shouldStart = cardState.pointerId === pointer.id;
      cardState.clearPress();

      if (shouldStart) {
        this.scene.start('HelicopterScene', { quizSetId: quizSet.id });
      }
    });

    this._cards.push(cardState);

    return y + innerHeight;
  }

  _drawCardBackground(graphics, width, height, color) {
    graphics.clear();
    graphics.fillStyle(color, 1);
    graphics.fillRoundedRect(0, 0, width, height, CARD_RADIUS);
  }

  _handleWheel(pointer, currentlyOver, deltaX, deltaY, deltaZ) {
    void currentlyOver;
    void deltaX;
    void deltaZ;

    if (!this._isPointerInsideList(pointer?.x, pointer?.y) || this._contentHeight <= this._listHeight) {
      return;
    }

    this._applyScrollOffset(this._scrollOffset - deltaY * WHEEL_SCROLL_FACTOR);
  }

  _handlePointerDown(pointer) {
    if (!this._isPointerInsideList(pointer?.x, pointer?.y)) {
      return;
    }

    this._scrollPointerId = pointer.id;
    this._scrollLastY = pointer.y;
    this._scrollDistance = 0;
  }

  _handlePointerMove(pointer) {
    if (
      pointer.id !== this._scrollPointerId ||
      !pointer.isDown ||
      this._contentHeight <= this._listHeight
    ) {
      return;
    }

    const deltaY = pointer.y - this._scrollLastY;
    this._scrollLastY = pointer.y;
    this._scrollDistance += Math.abs(deltaY);

    if (this._scrollDistance >= SCROLL_DRAG_THRESHOLD) {
      this._clearPressedCards();
      this._applyScrollOffset(this._scrollOffset + deltaY);
    }
  }

  _handlePointerUp(pointer) {
    if (pointer.id !== this._scrollPointerId) {
      return;
    }

    if (this._scrollDistance >= SCROLL_DRAG_THRESHOLD) {
      this._clearPressedCards();
    }

    this._scrollPointerId = null;
    this._scrollLastY = 0;
    this._scrollDistance = 0;
  }

  _handleResize(gameSize) {
    this._buildUI(this._quizSets, gameSize.width, gameSize.height);
  }

  _handleShutdown() {
    this.input.off('wheel', this._handleWheel, this);
    this.input.off('pointerdown', this._handlePointerDown, this);
    this.input.off('pointermove', this._handlePointerMove, this);
    this.input.off('pointerup', this._handlePointerUp, this);
    this.input.off('pointerupoutside', this._handlePointerUp, this);
    this.scale.off(Phaser.Scale.Events.RESIZE, this._handleResize, this);
    this._cards = [];
    this._quizSets = [];
    this._listContainer = null;
    this._listMaskGraphics = null;
  }

  _isPointerInsideList(x, y) {
    return (
      Number.isFinite(x) &&
      Number.isFinite(y) &&
      x >= this._listLeft &&
      x <= this._listLeft + this._listWidth &&
      y >= this._listTop &&
      y <= this._listTop + this._listHeight
    );
  }

  _clearPressedCards() {
    this._cards.forEach((card) => card.clearPress());
  }

  _getMinScrollOffset() {
    return Math.min(this._listHeight - this._contentHeight, 0);
  }

  _applyScrollOffset(offset) {
    this._scrollOffset = Phaser.Math.Clamp(offset, this._getMinScrollOffset(), 0);

    if (this._listContainer) {
      this._listContainer.y = this._listTop + this._scrollOffset;
    }
  }
}
