import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const seed=JSON.parse(readFileSync('.agents/skills/verify/drivers/verify-dummy.json','utf8'));
const features=JSON.parse(readFileSync('public/data/class-features.json','utf8'));
Object.assign(seed.character, {name:'Verify Selected Features', class:'wizard', level:10, classes:[{classSlug:'wizard',subclassSlug:null,level:5},{classSlug:'warlock',subclassSlug:null,level:5}],classFeatureChoices:{'warlock:invocations':['eldritch-smite','mask-of-many-faces'],'warlock:pact-boon':['pact-of-the-blade']},spellSlotsUsed:{3:1,'-1':0}});
const browser=await chromium.launch();
try {
const page=await browser.newPage({viewport:{width:1000,height:900}});
await page.goto('http://127.0.0.1:5173');
await page.getByRole('button',{name:'Got it',exact:true}).click({timeout:5000}).catch(()=>{});
await page.getByRole('button',{name:'Data',exact:true}).click();
await page.locator('input[type="file"][accept=".json"]').setInputFiles({name:'seed.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(seed))});
await page.getByText(seed.character.name).first().click();
const active=page.locator('[role="tabpanel"][data-state="active"]');
const section=active.locator('section').filter({has:page.getByRole('heading',{name:'Selected Class Features',exact:true})}).last();
for(const tab of ['Spells','Combat']){
 await page.getByRole('tab',{name:tab,exact:true}).click();
 await section.getByRole('button',{name:'Eldritch Smite',exact:true}).click();
 await section.getByText(features['warlock:invocations'].options.find(o=>o.slug==='eldritch-smite').description,{exact:true}).waitFor();
 await section.getByRole('button',{name:'Mask of Many Faces',exact:true}).waitFor();
 await section.getByText('4d8 force · 2 Pact slots left',{exact:true}).waitFor();
}
await section.getByRole('button',{name:'Use Pact slot',exact:true}).click();
await section.getByText('4d8 force · 1 Pact slots left',{exact:true}).waitFor();
await section.getByRole('button',{name:'Dmg',exact:true}).click();
await page.getByRole('dialog').getByRole('button',{name:'Crit (2×)',exact:true}).waitFor();
await page.getByRole('dialog').getByRole('button',{name:'Roll Damage',exact:true}).click();
await page.keyboard.press('Escape');
await section.getByRole('button',{name:'Use Pact slot',exact:true}).click();
await section.getByText('4d8 force · 0 Pact slots left',{exact:true}).waitFor();
assert.equal(await section.getByRole('button',{name:'Use Pact slot',exact:true}).isDisabled(),true);
await page.reload();
await page.getByRole('tab',{name:'Spells',exact:true}).click();
await section.getByText('4d8 force · 0 Pact slots left',{exact:true}).waitFor();
assert.equal(await section.getByRole('button',{name:'Use Pact slot',exact:true}).isDisabled(),true);
const stored=await page.evaluate(async()=>{
 const {useCharacterStore}=await import('/src/store/characters.ts');
 const character=useCharacterStore.getState().characters.find(c=>c.name==='Verify Selected Features');
 return {used:character.spellSlotsUsed,spells:character.spells};
});
assert.equal(stored.used[3],1,'standard spell slots must not be spent by Eldritch Smite');
assert.equal(stored.used[-1],2,'only Pact Magic slots are spent');
assert.deepEqual(stored.spells,seed.character.spells,'invocations must not be persisted as ordinary spells');
console.log('PASS: selected invocations in both tabs, secondary-warlock 4d8 smite, damage modal/crit, Pact spending and exhausted-state persistence');
}finally{await browser.close();}
