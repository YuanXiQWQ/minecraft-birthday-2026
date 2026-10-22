/** Pure rule contracts describe vanilla facts without granting products or consuming permanent unlocks. */
export type Ingredient = string | Ingredient[];

export interface Stack {
    id: string;
    count: number;
    components?: Record<string, unknown>;
}

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

export interface Recipe {
    id: string;
    type: string;
    pattern?: string[];
    key?: Record<string, Ingredient>;
    ingredients?: Ingredient[];
    ingredient?: Ingredient;
    result?: { id?: string; count?: number; components?: Record<string, unknown> };
    cookingtime?: number;

    [key: string]: any;
}

export interface Rules {
    recipes: Recipe[];
    items: Record<string, ItemRule>;
    itemTags: Record<string, string[]>;
    blockTags: Record<string, string[]>;
    intProviders: Record<string, any>;
    floatProviders: Record<string, any>;
    loot: Record<string, any>;
    sourceBlocks: Record<string, { requiresCorrectTool: boolean; source: string }>;
    interactions: Record<string, { input: string; output: string; requiresAdult: boolean; source: string }>;
}

export interface Match {
    recipe: string;
    result: Stack;
    remainders: (Stack | null)[];
    used: number[];
}
