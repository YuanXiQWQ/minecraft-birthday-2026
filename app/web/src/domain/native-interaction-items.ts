/** Native non-crafting interaction results supplement the locked recipe closure. */
import type {ItemRule} from '../rules/types.ts';
/** Water buckets have one-item stacks and an empty-bucket crafting remainder. */
export const INTERACTION_ITEMS:Record<string,ItemRule>={'minecraft:water_bucket':{id:'minecraft:water_bucket',maxStack:1,remainder:'minecraft:bucket',components:[],evidence:'Java 26.3 Items.WATER_BUCKET; BucketItem'}};
