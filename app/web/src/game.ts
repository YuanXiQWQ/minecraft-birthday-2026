/** Start the native loading surface before importing the full game composition. */
import {LoadingScreen} from './ui/loading-screen.ts';
/** Independent owner survives the application's root DOM replacement. */
const loading = new LoadingScreen(document.getElementById('native-loading')!);
/** The full game module downloads in parallel with the bounded native loading resources. */
const application = import('./app.ts').then(app => {loading.update('code', 1); return app;});
try {
    const [, app] = await Promise.all([loading.initialize(), application]);
    if (!loading.progress.ended) await app.mount('game', {}, loading);
} catch {
    loading.fail(document.getElementById('native-loading')?.dataset.failure ?? '');
}
