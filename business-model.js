import {uid,today,round,total,stock,unitCost,components,prepareSale,validateSale,verifyIntegrity,auditV2,physical} from './model.js';

export const SOURCES=['Online','Word of Mouth','Local Shop','Craft Show'];
export const PAYMENTS=['Zelle','Venmo','Cash','Card','PayPal','Bank Transfer','Other'];
export const STATUSES=['Requested','Confirmed','Making','Ready','Delivered','Cancelled'];
const cents=x=>Math.round(Number(x)*100);
const dateOK=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&!Number.isNaN(Date.parse(x+'T12:00:00'))&&new Date(x+'T12:00:00').getDate()===Number(x.slice(8));
const text=x=>String(x??'').trim();
export const paid=o=>round(Array.isArray(o.payments)?o.payments.reduce((n,p)=>n+p.amount,0):Number(o.deposit)||0);
export const balance=o=>round(Math.max(0,Number(o.total)-paid(o)));
export const open=o=>!['Delivered','Cancelled'].includes(o.status);
export const orderTotal=o=>round((o.lines||[]).reduce((n,l)=>n+l.qty*l.price,0)-Number(o.discount||0));
export function orderHolds(db,productId,exceptOrder=''){
 return db.orders.filter(o=>o.id!==exceptOrder&&open(o)&&!o.legacy).reduce((sum,o)=>sum+(o.lines||[]).reduce((n,l)=>n+(l.components||[]).filter(c=>c.product===productId).reduce((a,c)=>a+c.qty*l.qty,0),0),0);
}
export function available(db,p,exceptOrder=''){
 if(p.kind==='Set')return p.components?.length?Math.max(0,Math.min(...p.components.map(c=>{const part=db.products.find(x=>x.id===c.product);return part?Math.floor((physical(db,part)-Number(part.reserved||0)-orderHolds(db,part.id,exceptOrder))/c.qty):0}))):0;
 return Math.max(0,stock(db,p)-Number(p.reserved||0)-orderHolds(db,p.id,exceptOrder));
}
export function normalizeOrder(db,input,old){
 const o={...old,...input,id:old?.id||input.id||uid()};
 o.customer=text(o.customer);o.name=text(o.name)||('Order for '+o.customer);o.contact=text(o.contact);o.notes=text(o.notes);o.source=o.source||'Word of Mouth';o.shopName=text(o.shopName);
 if(!o.customer)throw Error('Enter the customer name.');
 if(!dateOK(o.orderDate))throw Error('Choose a valid order date.');
 if(o.due&&!dateOK(o.due))throw Error('Choose a valid due date.');
 if(o.due&&o.due<o.orderDate)throw Error('The due date cannot be before the order date.');
 if(!SOURCES.includes(o.source)||!STATUSES.includes(o.status))throw Error('Choose an order source and status.');
 if(o.event&&!db.events.some(e=>e.id===o.event))throw Error('Choose an existing craft show.');
 o.event=o.source==='Craft Show'?(o.event||''):'';
 if(!Array.isArray(o.lines)||!o.lines.length)throw Error('Add at least one ordered item.');
 o.lines=o.lines.map(l=>{
  const p=l.product?db.products.find(p=>p.id===l.product):null;
  if(l.product&&!p)throw Error('An ordered product is missing.');
  const line={...l,id:l.id||uid(),product:p?.id||'',custom:!p,name:text(l.name)||p?.name||'',category:text(l.category)||p?.category||'',subcategory:text(l.subcategory)||p?.subcategory||'',itemType:text(l.itemType)||p?.itemType||'',notes:text(l.notes),qty:Number(l.qty),price:Number(l.price),cost:Number(l.cost??(p?unitCost(db,p):0)),components:p?components(db,p):[]};
  if(!line.name||!Number.isInteger(line.qty)||line.qty<1||![line.price,line.cost].every(n=>Number.isFinite(n)&&n>=0))throw Error('Each item needs a name, a whole quantity, and valid price and cost.');
  if(cents(line.price)!==line.price*100&&Math.abs(cents(line.price)-line.price*100)>.0001)throw Error('Use no more than two decimal places for money.');
  if(p?.kind==='Set'&&!line.components.length)throw Error('Add this set’s components before ordering it.');
  return line;
 });
 o.discount=Number(o.discount||0);const subtotal=round(o.lines.reduce((n,l)=>n+l.qty*l.price,0));
 if(!Number.isFinite(o.discount)||o.discount<0||o.discount>subtotal)throw Error('Discount must be between zero and the item subtotal.');
 o.total=orderTotal(o);
 o.payments=(o.payments||[]).filter(p=>Number(p.amount)!==0).map(p=>({id:p.id||uid(),date:p.date||o.orderDate,method:p.method||'Zelle',amount:round(Number(p.amount)),reference:text(p.reference)}));
 const paymentIds=new Set();
 for(const p of o.payments){if(paymentIds.has(p.id)||!dateOK(p.date)||!PAYMENTS.includes(p.method)||!Number.isFinite(p.amount)||p.amount<=0)throw Error('Check payment dates, methods and amounts.');paymentIds.add(p.id)}
 if(cents(paid(o))>cents(o.total))throw Error('Payments cannot exceed the order total.');
 o.deposit=paid(o);o.legacy=false;
 if(old?.saleId){
  const locked=['lines','discount','total','customer','customerId','orderDate','source','shopName','event'];
  if(locked.some(k=>JSON.stringify(o[k]??'')!==JSON.stringify(old[k]??'')))throw Error('Delivered item and sale details stay in history. Use Return for a correction.');
  if(o.status!=='Delivered')throw Error('A delivered order stays delivered. Use its sale to record a return.');
  if((old.payments||[]).some(p=>!o.payments.some(n=>JSON.stringify(n)===JSON.stringify(p))))throw Error('Saved payments on a delivered order cannot be changed. Add another payment instead.');
 }
 o.updatedAt=new Date().toISOString();o.createdAt=old?.createdAt||o.createdAt||o.updatedAt;
 return o;
}
export function saveOrder(db,input){
 const next=structuredClone(db),old=next.orders.find(o=>o.id===input.id),o=normalizeOrder(next,input,old);
 const customer=next.customers.find(c=>c.id===o.customerId)||next.customers.find(c=>c.name.toLowerCase()===o.customer.toLowerCase());
 if(customer)o.customerId=customer.id;
 else if(!old?.saleId){const c={id:uid(),name:o.customer,phone:'',email:'',notes:o.contact||''};next.customers.push(c);o.customerId=c.id}
 if(o.status==='Cancelled'&&paid(o)>0&&old?.status!=='Cancelled')throw Error('This order has recorded payments. Resolve those payments before cancelling.');
 if(o.status==='Delivered'&&!o.saleId){
  const needed={};for(const l of o.lines)for(const c of l.components)needed[c.product]=(needed[c.product]||0)+c.qty*l.qty;
  for(const [id,qty]of Object.entries(needed)){const p=next.products.find(p=>p.id===id);if(!p||qty>available(next,p,o.id))throw Error((p?.name||'Item')+': not enough available stock to deliver this order. Record completed production or adjust stock first.')}
  const sale={id:'order-'+o.id,orderId:o.id,date:today(),time:new Date().toTimeString().slice(0,5),event:o.event||'',customer:o.customerId,source:o.source,shopName:o.shopName,payment:[...new Set(o.payments.map(p=>p.method))].join(' + ')||'Unpaid',discount:o.discount,lines:structuredClone(o.lines),notes:o.notes,override:false};
  prepareSale(next,sale);validateSale(next,sale);if(next.sales.some(s=>s.id===sale.id))throw Error('This order already has a sale.');
  next.sales.push(sale);o.saleId=sale.id;o.fulfilledDate=sale.date;
 }else if(o.saleId){const sale=next.sales.find(s=>s.id===o.saleId);if(!sale)throw Error('The linked sale is missing.');sale.payment=[...new Set(o.payments.map(p=>p.method))].join(' + ')||'Unpaid'}
 next.orders=old?next.orders.map(x=>x.id===o.id?o:x):[...next.orders,o];
 validateBusiness(next);return next;
}
export function validateBusiness(db){
 db=auditV2(verifyIntegrity(db));
 const seenSales=new Set();
 for(const o of db.orders){
  if(!o.lines||o.legacy)continue;
  if(!o.customer||!dateOK(o.orderDate)||!SOURCES.includes(o.source)||!STATUSES.includes(o.status)||!o.lines.length)throw Error('Invalid customer order.');
  if(o.lines.some(l=>!l.name||!Number.isInteger(l.qty)||l.qty<1||![l.price,l.cost].every(n=>Number.isFinite(n)&&n>=0)||l.product&&!db.products.some(p=>p.id===l.product)))throw Error('Invalid ordered item.');
  if(Math.abs(orderTotal(o)-o.total)>.005||Math.abs(paid(o)-o.deposit)>.005)throw Error('Order totals do not match their items or payments.');
  const paymentIds=new Set();for(const p of o.payments||[]){if(!dateOK(p.date)||!PAYMENTS.includes(p.method)||!Number.isFinite(p.amount)||p.amount<=0||paymentIds.has(p.id))throw Error('Invalid order payment.');paymentIds.add(p.id)}
  if(o.saleId){const s=db.sales.find(s=>s.id===o.saleId);if(!s||seenSales.has(o.saleId)||s.orderId!==o.id||Math.abs(total(s)-o.total)>.005||JSON.stringify(s.lines)!==JSON.stringify(o.lines)||o.status!=='Delivered')throw Error('An order and its linked sale disagree.');seenSales.add(o.saleId)}
  if(o.status==='Delivered'&&!o.saleId)throw Error('A delivered order is missing its sale.');
  if(o.customerId&&!db.customers.some(c=>c.id===o.customerId))throw Error('An order customer is missing.');
 }
 for(const s of db.sales)if(s.orderId&&!db.orders.some(o=>o.id===s.orderId&&o.saleId===s.id))throw Error('A sale is missing its linked order.');
 return db;
}
export function receipts(db,from='',to='9999'){
 const rows=[];
 for(const s of db.sales.filter(s=>!s.orderId&&s.date>=from&&s.date<=to))rows.push({date:s.date,method:s.payment||'Other',amount:total(s),source:s.source||(s.event?'Craft Show':'Other'),label:s.lines.map(l=>l.name).join(', '),event:s.event||''});
 for(const o of db.orders.filter(o=>!o.legacy))for(const p of o.payments||[])if(p.date>=from&&p.date<=to)rows.push({date:p.date,method:p.method,amount:p.amount,source:o.source,label:o.name,event:o.event||''});
 for(const r of db.returns.filter(r=>r.date>=from&&r.date<=to)){const s=db.sales.find(s=>s.id===r.sale);rows.push({date:r.date,method:r.payment||'Other',amount:-r.amount,source:s?.source||(r.event?'Craft Show':'Other'),label:'Refund',event:r.event||''})}
 return rows;
}
export function assertMergeStock(base,merged){
 const changedSales=merged.sales.some(s=>!base.sales.some(b=>b.id===s.id&&JSON.stringify(b)===JSON.stringify(s)));
 if(changedSales)for(const p of merged.products.filter(p=>p.kind!=='Set'))if(physical(merged,p)<0&&physical(base,base.products.find(b=>b.id===p.id)||{id:p.id,stock:0})>=0)throw Error('Both devices used the same stock for '+p.name+'. Review the deliveries before syncing.');
 return merged;
}
