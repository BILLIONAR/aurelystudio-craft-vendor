export const collections=['events','applications','products','sales','expenses','allocations','booth','packing','customers','goals','tasks','notes','templates','movements','returns','orders','closings','timeLogs'];
export const uid=()=>crypto.randomUUID?crypto.randomUUID():Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join('');
export const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
export function blank(){return {version:3,settings:{businessName:'Your maker business',currency:'USD',theme:'Olive Atelier'},...Object.fromEntries(collections.map(k=>[k,[]]))}}
export const total=s=>Math.round((s.lines.reduce((a,l)=>a+l.qty*l.price,0)-(s.discount||0))*100)/100;
export const sold=(d,p,event)=>d.sales.filter(s=>!event||s.event===event).reduce((n,s)=>n+s.lines.filter(l=>l.product===p).reduce((a,l)=>a+l.qty,0),0);
export const costFields=['applicationFee','boothFee','electricityFee','parkingCost','fuelCost','travelCost','hotelCost','foodCost'];
export function validateBackup(v){v=migrate(v);if(!v||v.version!==3||!v.settings||typeof v.settings.currency!=='string')throw Error('Not a valid Vendor OS backup.');for(const k of collections){if(!Array.isArray(v[k]))throw Error('Missing collection: '+k);const ids=new Set;for(const r of v[k]){if(!r||typeof r.id!=='string'||!/^[-a-zA-Z0-9_]+$/.test(r.id)||ids.has(r.id))throw Error('Invalid or duplicate record.');ids.add(r.id)}}for(const s of v.sales){if(!Array.isArray(s.lines)||!s.date||!Number.isFinite(s.discount)||s.lines.some(l=>!(v.products.some(p=>p.id===l.product)||(l.custom===true&&!l.product&&Array.isArray(l.components)&&l.components.length===0))||!Number.isInteger(l.qty)||l.qty<=0||![l.price,l.cost].every(n=>Number.isFinite(n)&&n>=0))||total(s)<0)throw Error('Invalid sale in backup.')}for(const k of ['sales','expenses','allocations','applications','booth','packing','tasks'])for(const r of v[k])if(r.event&&!v.events.some(e=>e.id===r.event))throw Error('Backup contains a missing event reference.');for(const p of v.products)if(![p.price,p.cost,p.stock].every(n=>Number.isFinite(n)&&n>=0))throw Error('Invalid product in backup.');return v}
export function demo(){const d=blank();d.demo=true;d.settings.businessName='The Sunday Studio';const date=n=>{let x=new Date();x.setDate(x.getDate()+n);return x.toLocaleDateString('en-CA')};d.products=[['Amber Soy Candle','Candles',24,7,70,10],['Botanical Clay Earrings','Jewelry',28,6,50,8],['Wildflower Art Print','Art & Paper',18,3,60,10],['Little Joys Sticker Set','Art & Paper',8,1.5,90,15],['Woven Keychain','Accessories',14,3,40,5]].map((x,i)=>({id:'p'+i,name:x[0],category:x[1],price:x[2],cost:x[3],stock:x[4],minStock:x[5],reserved:0,sku:'SUN-00'+(i+1)}));d.events=[['Riverside Makers Market',12,'Riverside Community Park','Accepted',120],['The Autumn Edit',28,'Old Town Assembly Hall','Planning',85],['Sunday at the Glasshouse',-8,'Botanical Gardens','Completed',95]].map((x,i)=>({id:'e'+i,name:x[0],date:date(x[1]),venue:x[2],status:x[3],boothFee:x[4],salesGoal:1200,boothNumber:'B'+(12+i),type:'Handmade Market',city:'Portland',deadline:date(i+3)}));for(let i=0;i<18;i++){const p=d.products[i%5];d.sales.push({id:uid(),date:date(-Math.floor(i/3)-3),time:'12:30',event:'e2',payment:i%3?'Card':'Cash',discount:0,lines:[{product:p.id,name:p.name,category:p.category,qty:1+i%3,price:p.price,cost:p.cost}]})}d.expenses=[{id:uid(),event:'e2',date:date(-8),category:'Travel',description:'Travel to Glasshouse',amount:24}];d.allocations=d.products.map(p=>({id:uid(),event:'e0',product:p.id,quantity:20}));d.packing=['Tent & weights','Table linens','Card reader & charger','Paper bags','Water & snacks'].map((name,i)=>({id:uid(),event:'e0',name,category:i<2?'Displays':'Checkout',quantity:1,completed:i<2}));d.booth=['Confirm booth dimensions','Check tent weights','Arrange display risers','Test checkout terminal'].map((name,i)=>({id:uid(),event:'e0',name,category:'Structure',completed:i===0}));d.tasks=[{id:uid(),title:'Print new price cards',event:'e0',due:date(0),priority:'High',status:'To Do'},{id:uid(),title:'Photograph autumn collection',due:date(2),priority:'Medium',status:'In Progress'}];d.customers=[{id:uid(),name:'Alex Morgan',email:'alex@example.com',event:'e2',interest:'Custom candle gift sets',followUp:date(1)}];d.goals=[{id:uid(),name:'A thoughtful month of growth',metric:'Monthly Revenue',target:1500,month:date(0).slice(0,7)}];demoImages(d);return d}

export function verifyIntegrity(v){v=validateBackup(v);try{new Intl.NumberFormat('en',{style:'currency',currency:v.settings.currency})}catch{throw Error('Invalid currency in backup.')};const numeric={events:[...costFields,'salesGoal','attendance'],products:['price','cost','stock','minStock','reserved'],expenses:['amount'],allocations:['quantity'],packing:['quantity'],goals:['target'],applications:['fee']};for(const [k,fields]of Object.entries(numeric))for(const r of v[k])for(const f of fields)if(r[f]!==undefined&&(!Number.isFinite(r[f])||r[f]<0))throw Error(`Invalid ${f} in ${k}.`);for(const a of v.allocations)if(!v.products.some(p=>p.id===a.product)||!Number.isInteger(a.quantity))throw Error('Invalid inventory allocation.');for(const t of v.templates)if(!['packing','booth','tasks'].includes(t.type)||typeof t.items!=='string')throw Error('Invalid template.');return v}

/** Revenue and total costs by seven-day buckets within the selected month. */
export function marketWeeks(d,month){
 const [year,mon]=month.split('-').map(Number),days=new Date(year,mon,0).getDate();
 return Array.from({length:Math.ceil(days/7)},(_,i)=>{
  const from=month+'-'+String(i*7+1).padStart(2,'0'),to=month+'-'+String(Math.min(days,(i+1)*7)).padStart(2,'0');
  const m=metrics(d,'',from,to);
  return {label:'Week '+(i+1),from,to,revenue:m.revenue,costs:m.cogs+m.expenses};
 });
}

export function demoImages(d){if(!d.demo)return false;let changed=false;const photos={p0:"soy-candle",p1:"clay-earrings",p2:"art-print",p3:"sticker-set"};for(const p of d.products){if(photos[p.id]&&!p.image){p.image="./assets/"+photos[p.id]+".png";changed=true}}for(const e of d.events){if(["e0","e1","e2"].includes(e.id)&&!e.image){e.image="./assets/market-booth.png";changed=true}}return changed}

// Version 2 adds append-only inventory and refund records while retaining v1 sales.
export function migrate(v){
 if(!v||typeof v!=='object'||![1,2,3].includes(v.version)||!v.settings)throw Error('Not a Vendor OS backup.');
 const out={...v,settings:{...v.settings},version:3};
 for(const k of ['movements','returns','orders','closings','timeLogs'])out[k]=v[k]??[];
 if(v.version<3)out.orders=out.orders.map(o=>({...o,legacy:true}));
 return out;
}
export const round=n=>Math.round((n+Number.EPSILON)*100)/100;
const n=v=>Number(v||0);
export function components(d,p){return p.kind==='Set'?(p.components||[]).map(c=>({product:c.product,qty:c.qty})): [{product:p.id,qty:1}]}
export function lineParts(d,l){return l.components||components(d,d.products.find(p=>p.id===l.product)||{id:l.product})}
export function physical(d,p){
 const used=d.sales.reduce((a,s)=>a+s.lines.reduce((b,l)=>b+lineParts(d,l).filter(c=>c.product===p.id).reduce((x,c)=>x+c.qty*l.qty,0),0),0);
 const returned=(d.returns||[]).filter(r=>r.restock).reduce((a,r)=>{const s=d.sales.find(s=>s.id===r.sale),l=s?.lines[r.line];return a+(l?lineParts(d,l).filter(c=>c.product===p.id).reduce((x,c)=>x+c.qty*r.qty,0):0)},0);
 return n(p.stock)+(d.movements||[]).filter(m=>m.product===p.id).reduce((a,m)=>a+m.delta,0)-used+returned;
}
export function stock(d,p){return p.kind==='Set'?(p.components?.length?Math.max(0,Math.min(...p.components.map(c=>Math.floor((physical(d,d.products.find(x=>x.id===c.product)||{id:c.product})-n(d.products.find(x=>x.id===c.product)?.reserved))/c.qty)))):0):physical(d,p)}
export function unitCost(d,p){return p.kind==='Set'?(p.components||[]).reduce((a,c)=>a+c.qty*n(d.products.find(x=>x.id===c.product)?.cost),0):n(p.cost)}
export function prepareSale(d,s){s.lines=s.lines.map(l=>{const p=d.products.find(p=>p.id===l.product);if(!p&&l.custom)return {...l,cost:l.cost??0,components:[]};return {...l,cost:l.cost??unitCost(d,p),components:l.components||components(d,p)}});return s}
export function validateSale(d,s,oldId){
 if(!s.lines?.length)throw Error('Add at least one product.');
 if((d.returns||[]).some(r=>r.sale===oldId))throw Error('A refunded sale is locked to preserve its history.');
 const dd={...d,sales:d.sales.filter(x=>x.id!==oldId)},needed={};let sub=0;
 for(const l of s.lines){const p=d.products.find(p=>p.id===l.product);if((!p&&!(l.custom===true&&!l.product&&l.components?.length===0))||!Number.isInteger(l.qty)||l.qty<=0||!Number.isFinite(l.price)||l.price<0)throw Error('Check product quantities and prices.');
 if(p?.kind==='Set'&&!p.components?.length)throw Error('Add the products inside this set first.');
 sub+=l.qty*l.price;for(const c of lineParts(d,l))needed[c.product]=(needed[c.product]||0)+c.qty*l.qty;
 const al=d.allocations.find(a=>a.event===s.event&&a.product===p?.id);if(al&&!s.override&&sold(dd,p.id,s.event)+s.lines.filter(x=>x.product===p.id).reduce((a,x)=>a+x.qty,0)>al.quantity)throw Error(`${p.name}: sale exceeds the event plan. Update the plan or enable override.`);
 }
 for(const [id,qty]of Object.entries(needed)){const p=d.products.find(p=>p.id===id);if(!p)throw Error('A set component is missing.');const held=d.orders.filter(o=>o.id!==s.orderId&&!o.legacy&&!['Delivered','Cancelled'].includes(o.status)).reduce((a,o)=>a+(o.lines||[]).reduce((b,l)=>b+(l.components||[]).filter(c=>c.product===id).reduce((n,c)=>n+c.qty*l.qty,0),0),0);const free=physical(dd,p)-Number(p.reserved||0)-held;if(!s.override&&qty>free)throw Error(`${p.name}: only ${Math.max(0,free)} available after held stock and open orders.`)}
 if(!Number.isFinite(s.discount)||s.discount<0||s.discount>sub)throw Error('Discount must be between zero and subtotal.');
}
export function refundValue(s,line,qty){const sub=s.lines.reduce((a,l)=>a+l.qty*l.price,0);if(!sub)return 0;let allocated=0;for(let i=0;i<line;i++)allocated+=round(total(s)*s.lines[i].qty*s.lines[i].price/sub);const value=line===s.lines.length-1?round(total(s)-allocated):round(total(s)*s.lines[line].qty*s.lines[line].price/sub);return round(value*qty/s.lines[line].qty)}
export function addReturn(d,r){const s=d.sales.find(s=>s.id===r.sale),l=s?.lines[r.line];if(!l||!Number.isInteger(r.qty)||r.qty<=0)throw Error('Choose a sale line and a whole quantity.');const previous=d.returns.filter(x=>x.sale===r.sale&&x.line===r.line);const qty=previous.reduce((a,x)=>a+x.qty,0);if(qty+r.qty>l.qty)throw Error('Return quantity exceeds the remaining sold quantity.');const amount=qty+r.qty===l.qty?round(refundValue(s,r.line,l.qty)-previous.reduce((a,x)=>a+x.amount,0)):refundValue(s,r.line,r.qty);const order=d.orders.find(o=>o.id===s.orderId);if(order&&!order.legacy){const received=(order.payments||[]).reduce((a,p)=>a+Number(p.amount||0),0),refunded=d.returns.filter(x=>x.sale===s.id).reduce((a,x)=>a+x.amount,0);if(round(refunded+amount)>round(received))throw Error('Refund exceeds this order’s recorded payments. Check its payments before recording a refund.');}d.returns.push({...r,id:uid(),event:s.event,payment:r.payment||s.payment,amount,cost:round(l.cost*r.qty),createdAt:new Date().toISOString()});}
export function metrics(d,event,from='',to='9999'){
 const match=r=>(!event||r.event===event)&&r.date>=from&&r.date<=to;
 const ss=d.sales.filter(match),rr=(d.returns||[]).filter(match),ex=d.expenses.filter(match),ev=d.events.filter(e=>(!event||e.id===event)&&e.date>=from&&e.date<=to&&e.status!=='Cancelled');
 const revenue=round(ss.reduce((a,s)=>a+total(s),0)-rr.reduce((a,r)=>a+r.amount,0));
 const cogs=round(ss.reduce((a,s)=>a+s.lines.reduce((b,l)=>b+l.qty*l.cost,0),0)-rr.filter(r=>r.restock).reduce((a,r)=>a+r.cost,0));
 const expenses=round(ex.reduce((a,e)=>a+n(e.amount),0)+ev.reduce((a,e)=>a+costFields.reduce((b,k)=>b+n(e[k]),0),0));
 const units=ss.reduce((a,s)=>a+s.lines.reduce((b,l)=>b+l.qty,0),0)-rr.reduce((a,r)=>a+r.qty,0),net=round(revenue-cogs-expenses);
 return {revenue,cogs,expenses,gross:round(revenue-cogs),net,roi:expenses?net/expenses*100:null,transactions:ss.length,units,aov:ss.length?revenue/ss.length:0,margin:revenue?net/revenue*100:0,refunds:rr.reduce((a,r)=>a+r.amount,0)};
}
export function production(d,event){
 const needed={},other={};
 for(const a of d.allocations){const e=d.events.find(e=>e.id===a.event),p=d.products.find(p=>p.id===a.product);if(!p||!e)continue;const target=a.event===event?needed:other;
 if(a.event!==event&&(e.date<today()||['Completed','Cancelled','Declined'].includes(e.status)))continue;
 const qty=Math.max(0,a.quantity-sold(d,p.id,a.event));for(const c of components(d,p))target[c.product]=(target[c.product]||0)+qty*c.qty;
 }
 return Object.entries(needed).map(([id,required])=>{const p=d.products.find(p=>p.id===id),held=d.orders.filter(o=>!o.legacy&&!['Delivered','Cancelled'].includes(o.status)).reduce((a,o)=>a+(o.lines||[]).reduce((b,l)=>b+(l.components||[]).filter(c=>c.product===id).reduce((n,c)=>n+c.qty*l.qty,0),0),0),available=Math.max(0,physical(d,p)-n(p.reserved)-n(other[id])-held);return {product:p,required,available,other:n(other[id]),missing:Math.max(0,required-available)}});
}
export function breakEven(d,e,price,cost,feePercent=0,feeFixed=0){const fixed=costFields.reduce((a,k)=>a+n(e[k]),0)+d.expenses.filter(x=>x.event===e.id).reduce((a,x)=>a+n(x.amount),0);const contribution=round(price-cost-price*feePercent/100-feeFixed);return {fixed:round(fixed),contribution,units:contribution>0?Math.ceil(round(fixed)/contribution):null}}
export function cashSummary(d,event,date,opening=0,paidOut=0,counted=0){const cash=s=>String(s.payment||s.method).trim().toLowerCase()==='cash';const ss=d.sales.filter(s=>!s.orderId&&s.event===event&&s.date===date&&cash(s)),rr=d.returns.filter(r=>r.event===event&&r.date===date&&cash(r));const orderCash=d.orders.filter(o=>!o.legacy&&(o.event||'')===event).flatMap(o=>o.payments||[]).filter(p=>p.date===date&&cash(p)).reduce((a,p)=>a+p.amount,0);const sales=round(ss.reduce((a,s)=>a+total(s),0)+orderCash),refunds=round(rr.reduce((a,r)=>a+r.amount,0)),expected=round(opening+sales-refunds-paidOut);return {sales,refunds,expected,difference:round(counted-expected)}}
export function validateProduct(d,p){if(!p.name?.trim())throw Error('Name your product.');if(![p.price,p.cost,p.stock,p.reserved||0].every(x=>Number.isFinite(x)&&x>=0))throw Error('Check product values.');if(!Number.isInteger(p.stock)||!Number.isInteger(p.reserved||0))throw Error('Stock must use whole units.');if(p.kind==='Set'){if(!p.components?.length)throw Error('Add at least one set component.');const seen=new Set;for(const c of p.components){const part=d.products.find(x=>x.id===c.product);if(!part||part.id===p.id||part.kind==='Set'||seen.has(c.product)||!Number.isInteger(c.qty)||c.qty<=0)throw Error('Use unique individual products with whole quantities; nested sets are not supported.');seen.add(c.product)}}}
export function auditV2(d){
 for(const p of d.products)validateProduct(d,p);
 for(const m of d.movements)if(!d.products.some(p=>p.id===m.product&&p.kind!=='Set')||!Number.isInteger(m.delta)||!m.date)throw Error('Invalid stock movement.');
 const check={...d,returns:[]};for(const r of d.returns){if(!Number.isFinite(r.amount)||r.amount<0||!Number.isFinite(r.cost)||r.cost<0||!r.date)throw Error('Invalid refund.');addReturn(check,r);const expected=check.returns.at(-1);if(Math.abs(expected.amount-r.amount)>.01||Math.abs(expected.cost-r.cost)>.01)throw Error('Refund does not match original sale.');}
 for(const s of d.sales)for(const l of s.lines)if(l.components&&l.components.some(c=>!d.products.some(p=>p.id===c.product)||!Number.isInteger(c.qty)||c.qty<=0))throw Error('Invalid historical set components.');
 for(const c of d.closings)if(!d.events.some(e=>e.id===c.event)||!c.date||!['opening','paidOut','counted','sales','refunds','expected','difference'].every(k=>Number.isFinite(c[k])))throw Error('Invalid cash closing.');
 for(const o of d.orders)if(!o.name||![o.total,o.deposit].every(x=>Number.isFinite(x)&&x>=0)||o.deposit>o.total)throw Error('Invalid custom order.');
 for(const t of d.timeLogs)if(!d.events.some(e=>e.id===t.event)||!Number.isFinite(t.hours)||t.hours<=0)throw Error('Invalid time log.');
 return d;
}
