/** Author welcome messages retain native identity, localization and the startup lifetime boundary. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {scheduleAuthorWelcome} from '../web/src/ui/author-welcome.ts';
import {GameChat} from '../web/src/ui/chat.ts';
import {GameStartup} from '../web/src/ui/game-startup.ts';
import {localeDictionary, translate} from '../web/src/i18n/index.ts';

for (const locale of ['en', 'zh-CN']) test(`ready ${locale} game schedules eight separate author messages after system controls without becoming player input`, (t) => {
    t.mock.timers.enable({apis: ['setTimeout']});
    const lifetime = new AbortController();
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'document'), children: {textContent: string}[] = [];
    Object.defineProperty(globalThis, 'document', {configurable: true, value: {createElement: () => ({textContent: ''})}});
    try {
        const chat = Object.assign(Object.create(GameChat.prototype), {
            messages: [], history: [], open: false, offset: 0, root: {dataset: {}},
            username: () => 'Vincent', accessible: {children, append: (line: {textContent: string}) => children.push(line)}, paint() {}
        }) as GameChat;
        const root = {dataset: {}, setAttribute() {}}, scene = {}, navigation = {};
        const startup = new GameStartup(root as unknown as HTMLElement, scene as HTMLElement, navigation as HTMLElement);
        const text = (key: string) => translate(key, {recipient: 'Vincent'}, localeDictionary(locale));
        chat.append([{text: text('game.worldHint')}]);
        assert.equal(chat.messages.length, 1);
        for (let i = 0; i < 3; i++) if (startup.finish()) scheduleAuthorWelcome(chat, text, lifetime.signal);
        assert.equal(chat.messages.length, 1);
        t.mock.timers.tick(2999);
        assert.equal(chat.messages.length, 1);
        t.mock.timers.tick(1);
        assert.equal(chat.messages.length, 2);
        for (let i = 0; i < 7; i++) {
            t.mock.timers.tick(4999);
            assert.equal(chat.messages.length, i + 2);
            t.mock.timers.tick(1);
            assert.equal(chat.messages.length, i + 3);
        }
        t.mock.timers.tick(60000);
        assert.equal(chat.messages.length, 9);
        assert.equal(chat.messages[0].kind, 'system');
        assert.equal(chat.messages[0].identity, undefined);
        for (const message of chat.messages.slice(1)) {
            assert.equal(message.kind, 'author');
            assert.equal(message.identity, 'YuanXiQWQ');
            assert.equal(message.runs[0].text, '<YuanXiQWQ> ');
        }
        assert.match(children[1].textContent, /Hi Vincent/);
        for (const command of ['/gamerule advance_time', '/gamerule advance_weather', '/time', '/weather', '/tick']) assert.ok(children[4].textContent.includes(command));
        assert.equal(children[7].textContent, '<YuanXiQWQ> ' + text('chat.welcome.chat'));
        assert.equal(children[8].textContent, '<YuanXiQWQ> ' + text('chat.welcome.scenes'));
        assert.deepEqual(chat.history, []);
        assert.equal(chat.username(), 'Vincent');
        assert.deepEqual(JSON.parse(chat.root.dataset.messages!).slice(1), chat.messages.slice(1));
    } finally {
        lifetime.abort();
        if (descriptor) Object.defineProperty(globalThis, 'document', descriptor); else Reflect.deleteProperty(globalThis, 'document');
    }
});

test('discarded startup never publishes author messages', () => {
    const startup = Object.assign(Object.create(GameStartup.prototype), {disposed: true, ready: false}) as GameStartup;
    assert.equal(startup.finish(), false);
});

for (const elapsed of [0, 3000, 13000]) test(`leaving the document at ${elapsed}ms cancels unread author messages`, t => {
    t.mock.timers.enable({apis: ['setTimeout']});
    const lifetime = new AbortController(), messages: unknown[] = [];
    scheduleAuthorWelcome({append: (...args) => {messages.push(args);}} as Pick<GameChat, 'append'>, key => key, lifetime.signal);
    t.mock.timers.tick(elapsed);
    const delivered = messages.length;
    lifetime.abort();
    t.mock.timers.tick(100000);
    assert.equal(messages.length, delivered);
});

test('delayed timers never burst, and unread messages resolve the current language', t => {
    t.mock.timers.enable({apis: ['setTimeout']});
    const lifetime = new AbortController(), messages: string[] = [];
    let language = 'en';
    const cancel = scheduleAuthorWelcome({append: runs => {messages.push(runs[0].text);}} as Pick<GameChat, 'append'>,
        key => translate(key, {recipient: 'Vincent'}, localeDictionary(language)), lifetime.signal);
    t.mock.timers.tick(60000);
    assert.equal(messages.length, 1);
    assert.match(messages[0], /Hi Vincent!/);
    language = 'zh-CN';
    t.mock.timers.tick(5000);
    assert.match(messages[1], /配方/);
    cancel();
    t.mock.timers.tick(100000);
    assert.equal(messages.length, 2);
});

test('already aborted lifetime never starts author delivery', t => {
    t.mock.timers.enable({apis: ['setTimeout']});
    const lifetime = new AbortController();
    lifetime.abort();
    scheduleAuthorWelcome({append: () => assert.fail('unexpected author')} as Pick<GameChat, 'append'>, key => key, lifetime.signal);
    t.mock.timers.tick(60000);
});

test('reset cancels the old author sequence and sends all eight messages once for the new generation', async t => {
    t.mock.timers.enable({apis:['setTimeout']});
    const {AuthorWelcome}=await import('../web/src/ui/author-welcome.ts');
    const lifetime=new AbortController(), messages:string[]=[];
    const welcome=new AuthorWelcome({append:runs=>messages.push(runs[0].text)} as Pick<GameChat,'append'>,key=>key,lifetime.signal);
    welcome.sync('first',false);t.mock.timers.tick(10000);assert.equal(messages.length,0);
    welcome.sync('first',true);t.mock.timers.tick(3000);assert.equal(messages.length,1);
    welcome.sync('reset',true);t.mock.timers.tick(2999);assert.equal(messages.length,1);
    welcome.sync('reset',true);t.mock.timers.tick(1);assert.equal(messages.length,2);assert.equal(messages[0],messages[1]);
    for(let i=0;i<7;i++){welcome.sync('reset',true);t.mock.timers.tick(5000);}
    assert.equal(messages.length,9);assert.equal(new Set(messages.slice(1)).size,8);
    welcome.sync('reset',true);t.mock.timers.tick(60000);assert.equal(messages.length,9);
    welcome.sync('second-reset',true);lifetime.abort();t.mock.timers.tick(60000);assert.equal(messages.length,9);
});
