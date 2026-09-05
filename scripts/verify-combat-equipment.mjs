import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const catalog=JSON.parse(readFileSync('public/data/equipment.json','utf8'));
const weapon=catalog.weapons.find(w=>w.description && w.damage_dice);
const armor=catalog.armor.find(a=>a.description);
const seed=JSON.parse(readFileSync('.agents/skills/verify/drivers/verify-dummy.json','utf8'));
seed.character.equipment=[weapon,armor].map((x,i)=>({id:`gear-${i}`,name:x.name,quantity:1,equipped:true}));
const browser=await chromium.launch();
try {
 const page=await browser.newPage();
 await page.goto('http://127.0.0.1:5173');
 await page.getByRole('button',{name:'Got it',exact:true}).click({timeout:5000}).catch(()=>{});
 await page.getByRole('button',{name:'Data',exact:true}).click();
 await page.locator('input[type="file"][accept=".json"]').setInputFiles({name:'seed.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(seed))});
 await page.getByText('Verify Dummy').first().click();
 await page.getByRole('tab',{name:'Combat',exact:true}).click();
 for(const item of [weapon,armor]) {
 const button=page.getByRole('button',{name:item.name,exact:true}).first();
 await button.click({timeout:3000});
 assert.equal(await button.getAttribute('aria-expanded'),'true');
 await page.getByText(item.description,{exact:true}).waitFor();
 await button.click();
 assert.equal(await button.getAttribute('aria-expanded'),'false');
 }
 await page.getByRole('button',{name:weapon.name,exact:true}).last().click();
 await page.getByText(weapon.description,{exact:true}).waitFor();
 console.log('PASS: loadout weapons/armor and weapon attacks expand descriptions and collapse');
} finally {await browser.close();}
