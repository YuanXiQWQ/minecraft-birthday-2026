/** Minimal rendering port excludes experimental UI, save state and temporary inventory rules. */
import type {Scene,PerspectiveCamera} from 'three';
export interface EffectScene {scene:Scene;camera:PerspectiveCamera;profile:{phases:Record<string,number>}}
