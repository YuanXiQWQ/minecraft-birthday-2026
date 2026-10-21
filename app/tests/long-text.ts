/** P3_TEST_ONLY: long ASCII copy exercises the ordinary formal layout through its locale input. */
import {mount} from '../web/src/app.ts';import {ENGLISH} from '../web/src/i18n/index.ts';import type {Dictionary} from '../web/src/i18n/index.ts';
if(import.meta.env.MODE!=='verification')throw new Error('verification-only');
/** Preserve each interpolation contract while extending visible headings, paragraphs, controls and errors. */
const dictionary=Object.fromEntries(Object.entries(ENGLISH).map(([key,value])=>[key,value+' A much longer piece of translated text for checking wrapping and available space. LongUnbrokenLocalizationTokenForWrappingChecks.'])) as Dictionary;
void mount('home',dictionary);
