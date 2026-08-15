export type CharacterId = 'mulher-loira' | 'homem-negro' | 'homem-branco';

export type CharacterPreset = {
  id: CharacterId;
  label: string;
  skinColor: number;
  hairColor: number;
  hairStyle: 'long' | 'short';
};

export const CHARACTER_ORDER: readonly CharacterId[] = ['mulher-loira', 'homem-negro', 'homem-branco'];

export const CHARACTER_PRESETS: Record<CharacterId, CharacterPreset> = {
  'mulher-loira': {
    id: 'mulher-loira',
    label: 'Aurora',
    skinColor: 0xffd9b3,
    hairColor: 0xffd23f,
    hairStyle: 'long',
  },
  'homem-negro': {
    id: 'homem-negro',
    label: 'Onix',
    skinColor: 0x6b4423,
    hairColor: 0x14100d,
    hairStyle: 'short',
  },
  'homem-branco': {
    id: 'homem-branco',
    label: 'Cristal',
    skinColor: 0xffe0c2,
    hairColor: 0x4a2f1f,
    hairStyle: 'short',
  },
};

export const DEFAULT_CHARACTER: CharacterId = 'mulher-loira';
