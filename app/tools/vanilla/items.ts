/** Static registration analysis extracts rule-relevant defaults from same-version javap instructions, never item suffixes. */
export interface ItemRule {
    id: string;
    maxStack: number;
    maxDamage?: number;
    equipment?: string;
    remainder?: string;
    fuel?: string;
    tool?: { role: string; incorrect: string; speed: number };
    components: string[];
    evidence: string;
}

/** Keep instruction streams separate from constant pools and debug/source tables.
 * @param {string} text Verbose javap output.
 * @return {Map<string,string>} Method declaration to instruction body.
 */
export function methods(text: string): Map<string, string> {
    const out = new Map<string, string>();
    for (const m of text.matchAll(/^ {2}((?:public|private|protected|static).+);\n([\s\S]*?)(?=^ {2}\S|^})/gm)) {
        const instructions = [...m[2].matchAll(/^\s+\d+:\s+(.+)$/gm)].map(x => x[1]).join('\n');
        if (instructions) out.set(m[1], instructions);
    }
    return out;
}

/** Resolve a method by its exact declared name, rejecting absent evidence.
 * @param {string} text javap output.
 * @param {string} name Method name or static initializer.
 * @return {string} Instruction body.
 */
export function body(text: string, name = 'static {}'): string {
    const entry = [...methods(text)].find(([h]) => name === 'static {}' ? h === name : h.includes(' ' + name + '('));
    if (!entry) throw new Error('missing-method:' + name);
    return entry[1];
}

/** Decode a numeric JVM constant without interpreting arbitrary bytecode.
 * @param {string} line Single instruction.
 * @return {number|undefined} Literal value.
 */
function number(line: string): number | undefined {
    const m = line.match(/^[if]const_(m1|\d)/);
    if (m) return m[1] === 'm1' ? -1 : Number(m[1]);
    const a = line.match(/^(?:bipush|sipush)\s+(-?\d+)|\/\/ (?:int|float) (-?[\d.]+)f?/);
    return a ? Number(a[1] ?? a[2]) : undefined;
}

/** Pair literal resource identifiers with their actual registry reference fields.
 * @param {string} text Reference class evidence.
 * @return {Record<string,string>} Field-to-namespaced-ID mapping.
 */
function references(text: string): Record<string, string> {
    const out: Record<string, string> = {};
    let lines: string[] = [];
    for (const line of body(text).split('\n')) {
        lines.push(line);
        const field = line.match(/putstatic.*\/\/ Field (\w+):/);
        if (field) {
            const literal = lines.map(l => l.match(/\/\/ String (.+)/)?.[1]).filter(Boolean).at(-1);
            if (literal && !lines.some(l => l.includes('createSimpleColored'))) out[field[1]] = 'minecraft:' + literal;
            lines = [];
        }
    }
    return out;
}

/** Extract per-field registration blocks without confusing declarations with initialization.
 * @param {string} instructions Static initializer instructions.
 * @return {Record<string,string>} Blocks ending at each putstatic field.
 */
function assignments(instructions: string): Record<string, string> {
    const out: Record<string, string> = {};
    let lines: string[] = [];
    for (const line of instructions.split('\n')) {
        lines.push(line);
        const m = line.match(/putstatic.*\/\/ Field (\w+):/);
        if (m) {
            out[m[1]] = lines.join('\n');
            lines = [];
        }
    }
    return out;
}

/** Compile bounded component projections and retain source identity for every native registration.
 * @param {Record<string,string>} classes Same-version class evidence.
 * @param {Record<string,any>} documents Original JSON evidence.
 * @return {Record<string,ItemRule>} Rule-relevant registered item defaults.
 */
export function itemRules(classes: Record<string, string>, documents: Record<string, any>): Record<string, ItemRule> {
    const blockTagIds = references(classes['tags.BlockTags']),
        componentIds = references(classes['core.component.DataComponents']);
    const ids = {...references(classes['references.BlockItemIds']), ...references(classes['references.ItemIds'])},
        fuelIds = references(classes['world.level.storage.loot.providers.number.ints.ContextIntProviders']);
    const material = assignments(body(classes['world.item.ToolMaterial'])),
        armor = assignments(body(classes['world.item.equipment.ArmorMaterials'])),
        armorTypes = assignments(body(classes['world.item.equipment.ArmorType'])), text = classes['world.item.Items'],
        methodMap = methods(text), bootstrap: Record<string, string> = {};
    for (const section of text.slice(text.indexOf('BootstrapMethods:')).split(/^ {2}(?=\d+:)/m)) {
        const index = section.match(/^(\d+):/),
            target = section.match(/REF_invokeStatic net\/minecraft\/world\/item\/Items\.([^:]+):/);
        if (index && target) bootstrap[index[1]] = target[1];
    }
    const defaults = classes['core.component.DataComponents'];
    if (!/Field MAX_STACK_SIZE:[^\n]*\n\s+\d+: bipush\s+64/.test(defaults)) throw new Error('unverified-default-stack');
    const out: Record<string, ItemRule> = {};
    for (const [field, registration] of Object.entries(assignments(body(text)))) {
        const reference = registration.match(/(?:references\/BlockItemIds|references\/ItemIds)\.(\w+):/)?.[1],
            id = reference ? ids[reference] : undefined;
        if (!id) continue;
        let expanded = registration;
        for (const m of registration.matchAll(/\/\/ InvokeDynamic #(\d+):/g)) {
            const name = bootstrap[m[1]], entry = name && [...methodMap].find(([h]) => h.includes(' ' + name + '('));
            if (entry) expanded += '\n' + entry[1];
        }
        const rule: ItemRule = {id, maxStack: 64, components: [], evidence: 'net.minecraft.world.item.Items#' + field};
        const lines = expanded.split('\n');
        for (let i = 0; i < lines.length; i++) {
            const l = lines[i];
            if (l.includes('Item$Properties.stacksTo:')) {
                const v = number(lines[i - 1]);
                if (v === undefined) throw new Error('unresolved-stack:' + id);
                rule.maxStack = v;
            }
            if (l.includes('Item$Properties.durability:')) {
                const v = number(lines[i - 1]);
                if (v === undefined) throw new Error('unresolved-damage:' + id);
                rule.maxDamage = v;
                rule.maxStack = 1;
            }
        }
        const tool = expanded.match(/ToolMaterial\.(\w+):/),
            role = expanded.match(/Item\$Properties\.(pickaxe|axe|shovel|hoe|sword|spear):/);
        if (tool && role) {
            const code = material[tool[1]], nums = code.split('\n').map(number).filter(v => v !== undefined),
                incorrect = code.match(/BlockTags\.(\w+):/)?.[1];
            if (!incorrect || nums.length < 2) throw new Error('unresolved-tool:' + id);
            const tag = blockTagIds[incorrect];
            if (!tag || !documents['data/minecraft/tags/block/' + tag.split(':')[1] + '.json']) throw new Error('missing-tool-tag');
            rule.maxDamage = nums[0];
            rule.maxStack = 1;
            if (role[1] !== 'spear') rule.tool = {role: role[1], incorrect: tag, speed: nums[1]};
        }
        if (expanded.includes('Item$Properties.humanoidArmor:')) {
            const a = expanded.match(/ArmorMaterials\.(\w+):/), t = expanded.match(/ArmorType\.(\w+):/);
            if (!a || !t) throw new Error('unresolved-armor');
            const multiplier = armor[a[1]].split('\n').map(number).find(v => v !== undefined), type = armorTypes[t[1]],
                base = type.split('\n').map(number).filter(v => v !== undefined).at(-1);
            if (multiplier === undefined || base === undefined) throw new Error('unresolved-armor-durability');
            rule.maxStack = 1;
            rule.maxDamage = multiplier * base;
            rule.equipment = type.match(/EquipmentSlot\.(\w+):/)?.[1].toLowerCase();
        }
        const fuel = expanded.match(/ContextIntProviders\.(\w+):[^\n]*\n(?:[^\n]*\n){0,2}[^\n]*Item\$Properties.cookingFuel:/);
        if (fuel) {
            rule.fuel = fuelIds[fuel[1]];
            if (!rule.fuel) throw new Error('unresolved-fuel:' + id);
        }
        const remainder = expanded.match(/Field (?:net\/minecraft\/world\/item\/Items\.)?(\w+):Lnet\/minecraft\/world\/item\/Item;[^\n]*\n[^\n]*Item\$Properties.craftRemainder:/);
        if (remainder) {
            rule.remainder = ids[remainder[1]];
            if (!rule.remainder) throw new Error('unresolved-remainder');
        }
        let componentCode = expanded;
        const pending = [...expanded.matchAll(/Item\$Properties\.(\w+):/g)].map(m => m[1]), visited = new Set<string>(),
            propertyMethods = methods(classes['world.item.Item$Properties']);
        while (pending.length) {
            const name = pending.pop()!;
            if (visited.has(name)) continue;
            visited.add(name);
            for (const [header, code] of propertyMethods) if (header.includes(' ' + name + '(')) {
                componentCode += '\n' + code;
                for (const m of code.matchAll(/\/\/ Method (?:net\/minecraft\/world\/item\/Item\$Properties\.)?(\w+):/g)) if ([...propertyMethods.keys()].some(h => h.includes(' ' + m[1] + '('))) pending.push(m[1]);
            }
        }
        rule.components = ['minecraft:max_stack_size', ...[...componentCode.matchAll(/DataComponents\.(\w+):/g)].map(m => {
            const id = componentIds[m[1]];
            if (!id) throw new Error('unknown-component-reference:' + m[1]);
            return id;
        })];
        if (rule.maxDamage) {
            rule.components.push('minecraft:max_damage', 'minecraft:damage');
        }
        if (rule.tool) rule.components.push('minecraft:tool');
        if (rule.fuel) rule.components.push('minecraft:cooking_fuel');
        if (rule.equipment) rule.components.push('minecraft:equippable');
        rule.components = [...new Set(rule.components)].sort();
        out[id] = rule;
    }
    return out;
}
