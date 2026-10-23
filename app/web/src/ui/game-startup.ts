/** Keep partial game composition out of view until native resources, HUD and input owners are ready. */
export class GameStartup {
    ready = false;
    disposed = false;

    /** Retain layout for renderer sizing while excluding incomplete controls from display and input.
     * @param {HTMLElement} root Game application root.
     * @param {HTMLElement} scene World and GUI host.
     * @param {HTMLElement} navigation Four-scene navigation.
     */
    constructor(public root: HTMLElement, public scene: HTMLElement, public navigation: HTMLElement) {
        root.dataset.boot = 'loading';
        root.setAttribute('aria-busy', 'true');
        scene.inert = true;
        navigation.hidden = true;
        navigation.inert = true;
    }

    /** Publish the completed composition once, before starting the panel's five-second interval.
     * @return {boolean} Whether this live composition became ready.
     */
    finish(): boolean {
        if (this.disposed || this.ready) return false;
        this.ready = true;
        this.root.dataset.boot = 'ready';
        this.root.setAttribute('aria-busy', 'false');
        this.scene.inert = false;
        this.navigation.inert = false;
        this.navigation.hidden = false;
        return true;
    }

    /** Keep an incomplete game hidden while a separate localized failure remains available. */
    fail(): void {
        if (this.disposed) return;
        this.ready = false;
        this.root.dataset.boot = 'failed';
        this.root.setAttribute('aria-busy', 'false');
        this.scene.inert = true;
        this.navigation.hidden = true;
        this.navigation.inert = true;
    }

    /** Prevent late initialization from publishing a document that has already left. */
    dispose(): void {this.disposed = true;}
}
