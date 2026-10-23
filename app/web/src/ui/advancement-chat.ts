/** Only committed native advancement completions produce the original system announcement. */
import {ADVANCEMENTS,advancementDone} from '../domain/advancements.ts';
import type {DomainEvent,State} from '../domain/types.ts';
import {advancementText} from '../i18n/advancements.ts';
import type {TextRun} from './item-style.ts';

/** Substitute native component arguments while preserving styles and positional translation order.
 * @param {string} template Same-version language template.
 * @param {TextRun[][]} args Original component arguments.
 * @return {TextRun[]} Styled literal and argument segments.
 */
export function nativeChatRuns(template:string,args:TextRun[][]):TextRun[] {
    const runs:TextRun[]=[];let from=0,next=0;
    for(const match of template.matchAll(/%%|%(?:(\d+)\$)?s/g)){
        if(match.index>from)runs.push({text:template.slice(from,match.index)});
        if(match[0]==='%%')runs.push({text:'%'});
        else{const argument=args[match[1]?Number(match[1])-1:next++];if(!argument)throw Error('invalid-native-chat-argument');runs.push(...structuredClone(argument));}
        from=match.index+match[0].length;
    }
    if(from<template.length)runs.push({text:template.slice(from)});
    return runs;
}

/** Project PlayerAdvancements' newly-done and announce-to-chat checks without deriving progress from item unlocks.
 * @param {DomainEvent} event Published only after durable success.
 * @param {State} state Authoritative committed snapshot and username.
 * @return {TextRun[][]} Original task announcements; roots and unrelated item events remain silent.
 */
export function advancementChat(event:DomainEvent,state:State):TextRun[][] {
    if(event.type!=='advancements-completed')return [];
    const locale=state.settings.locale,lines:TextRun[][]=[];
    for(const id of new Set(event.advancements??[])){
        const node=Object.hasOwn(ADVANCEMENTS,id)?ADVANCEMENTS[id]:null;
        if(!node||node.display.announce_to_chat===false||!advancementDone(state.progress.advancements,id))continue;
        const title=advancementText(node.display.title.translate,locale),description=advancementText(node.display.description.translate,locale),color='#55FF55';
        const name=nativeChatRuns(advancementText('chat.square_brackets',locale),[[{text:title,hover:[{text:title,color},{text:description,color}]}]]).map(run=>({...run,color}));
        lines.push(nativeChatRuns(advancementText('chat.type.advancement.task',locale),[[{text:state.settings.username??'sireoh'}],name]));
    }
    return lines;
}
