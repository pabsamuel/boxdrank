/* Nukon Fiber Lazer — Mobil İzleme Paneli
 * Salt görüntüleme. Şu an SİMÜLASYON verisiyle çalışır.
 * Gerçek makineye bağlamak için: DataSource.fetch() içini
 * `fetch('/api/status')` ile değiştir (bkz. PLAN.md API sözleşmesi).
 */

// ---- Yardımcılar --------------------------------------------------
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function fmtDur(sec){
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec/3600), m = Math.floor((sec%3600)/60), s = sec%60;
  return h ? `${h}s ${m}dk` : `${m}:${String(s).padStart(2,'0')}`;
}
function fmtClock(d){ return d.toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'}); }

const STATE_TR = {
  running:'KESİM YAPILIYOR', idle:'BOŞTA', paused:'DURAKLATILDI',
  alarm:'ALARM', maintenance:'BAKIM', offline:'BAĞLANTI YOK'
};
const STATE_SUB = {
  running:'Makine aktif çalışıyor', idle:'İş bekleniyor',
  paused:'Operatör tarafından duraklatıldı', alarm:'Müdahale gerekiyor!',
  maintenance:'Bakım modunda', offline:'Köprü servisine ulaşılamıyor'
};

// ---- Simülasyon veri kaynağı -------------------------------------
// Gerçek makine yokken canlı benzeri veri üretir.
const Sim = {
  state:'running',
  job:{ name:'kapak-2mm-304.nc', progress:0.12, elapsedSec:70, remainingSec:520,
        material:'304 Paslanmaz', thicknessMm:2, gas:'Azot', partsDone:3, partsTotal:30 },
  sensors:{ gasPressureBar:14.2, coverClosed:true, chillerTempC:27.5 },
  alerts:[],
  shift:{ runtimeSec:21600, jobsDone:12, partsDone:240, oee:0.78 },
  _lastAlarm:false,

  tick(){
    if(this.state === 'running'){
      // İlerlemeyi artır
      this.job.elapsedSec += 2;
      this.job.remainingSec = Math.max(0, this.job.remainingSec - 2);
      const total = this.job.elapsedSec + this.job.remainingSec;
      this.job.progress = clamp(this.job.elapsedSec / total, 0, 1);
      this.job.partsDone = Math.min(this.job.partsTotal,
        Math.round(this.job.progress * this.job.partsTotal));
      // Sensör dalgalanması
      this.sensors.gasPressureBar = +(14 + Math.sin(Date.now()/4000)*0.6).toFixed(1);
      this.sensors.chillerTempC = +(27 + Math.sin(Date.now()/9000)*1.2).toFixed(1);
      this.shift.runtimeSec += 2;
      // İş bitti mi?
      if(this.job.progress >= 1){ scenario('done'); }
    }
    return this.snapshot();
  },
  snapshot(){
    return { state:this.state, machine:'Nukon Fiber Lazer',
      updatedAt:new Date().toISOString(),
      job:{...this.job}, sensors:{...this.sensors},
      alerts:[...this.alerts], shift:{...this.shift} };
  }
};

// Demo senaryoları — arayüzü göstermek için.
function scenario(scn){
  const now = new Date();
  switch(scn){
    case 'running':
      Sim.state='running';
      Sim.job={ name:'kapak-2mm-304.nc', progress:0.12, elapsedSec:70, remainingSec:520,
        material:'304 Paslanmaz', thicknessMm:2, gas:'Azot', partsDone:3, partsTotal:30 };
      Sim.alerts=[]; break;
    case 'idle':
      Sim.state='idle';
      Sim.job.progress=0; Sim.job.name='—'; Sim.job.remainingSec=0; Sim.job.elapsedSec=0;
      break;
    case 'done':
      Sim.state='idle';
      Sim.job.progress=1; Sim.job.partsDone=Sim.job.partsTotal; Sim.job.remainingSec=0;
      Sim.shift.jobsDone += 1; Sim.shift.partsDone += Sim.job.partsTotal;
      pushAlert('info','İş tamamlandı: '+Sim.job.name, now);
      notify('İş tamamlandı ✔', Sim.job.name+' bitti.');
      break;
    case 'gaslow':
      Sim.sensors.gasPressureBar=9.4;
      pushAlert('warning','Azot basıncı düşük (9.4 bar)', now);
      notify('⚠ Gaz basıncı düşük','Azot basıncı 9.4 bar');
      break;
    case 'alarm':
      Sim.state='alarm';
      pushAlert('alarm','Kesim hatası — kafa çarpması algılandı', now);
      notify('⛔ ALARM','Makine durdu — müdahale gerekiyor');
      break;
  }
  render(Sim.snapshot());
}
function pushAlert(level,msg,at){
  Sim.alerts.unshift({level,msg,at:at.toISOString()});
  Sim.alerts = Sim.alerts.slice(0,6);
}

// ---- Bildirimler --------------------------------------------------
function notify(title, body){
  if(!('Notification' in window) || Notification.permission!=='granted') return;
  try{ new Notification(title,{body,icon:'assets/icon-192.png'}); }catch(e){}
}
$('notifBtn').addEventListener('click', async ()=>{
  if(!('Notification' in window)){ alert('Bu cihaz bildirimi desteklemiyor.'); return; }
  const p = await Notification.requestPermission();
  $('notifBtn').textContent = p==='granted' ? '🔔 Bildirimler Açık' : '🔔 Bildirim reddedildi';
});

// ---- Ekrana çizim -------------------------------------------------
function render(d){
  // Üst bar
  $('machineName').textContent = d.machine;
  $('updatedAt').textContent = fmtClock(new Date(d.updatedAt));
  const off = d.state==='offline';
  $('connDot').style.background = off ? 'var(--red)' : 'var(--yellow)';
  $('connText').textContent = off ? 'Çevrimdışı' : 'Simülasyon';

  // Durum kartı
  const card = $('statusCard');
  card.className = 'card status-card st-'+d.state;
  $('statusBig').textContent = STATE_TR[d.state] || d.state;
  $('statusSub').textContent = STATE_SUB[d.state] || '';

  // İş
  const j = d.job, pct = Math.round((j.progress||0)*100);
  $('ring').style.setProperty('--p', pct);
  $('ringPct').textContent = pct+'%';
  $('jobName').textContent = j.name || '—';
  $('jobMaterial').textContent = j.material || '—';
  $('jobThickness').textContent = j.thicknessMm ? j.thicknessMm+' mm' : '—';
  $('jobGas').textContent = j.gas || '—';
  $('elapsed').textContent = fmtDur(j.elapsedSec||0);
  $('remaining').textContent = fmtDur(j.remainingSec||0);
  $('parts').textContent = (j.partsDone??'—')+'/'+(j.partsTotal??'—');

  // Sensörler
  const s = d.sensors;
  const gp = $('gasP'), gpWrap = gp.closest('.sensor');
  gp.textContent = s.gasPressureBar?.toFixed(1) ?? '—';
  gpWrap.className = 'sensor' + (s.gasPressureBar < 10 ? ' bad' : s.gasPressureBar < 12 ? ' warn' : '');
  const ch = $('chiller'), chWrap = ch.closest('.sensor');
  ch.textContent = s.chillerTempC?.toFixed(1) ?? '—';
  chWrap.className = 'sensor' + (s.chillerTempC > 30 ? ' warn' : '');
  $('cover').textContent = s.coverClosed ? 'Kapalı' : 'AÇIK';
  $('cover').closest('.sensor').className = 'sensor' + (s.coverClosed ? '' : ' bad');

  // Uyarılar
  const ul = $('alerts');
  if(!d.alerts.length){ ul.innerHTML = '<li class="alert-empty">Uyarı yok</li>'; }
  else{
    ul.innerHTML = d.alerts.map(a=>`<li class="alert ${a.level}">
      <span class="alert-msg">${a.msg}</span>
      <span class="alert-time">${fmtClock(new Date(a.at))}</span></li>`).join('');
  }

  // Vardiya
  $('shRuntime').textContent = fmtDur(d.shift.runtimeSec);
  $('shJobs').textContent = d.shift.jobsDone;
  $('shParts').textContent = d.shift.partsDone;
  $('shOee').textContent = Math.round(d.shift.oee*100)+'%';
}

// ---- Demo butonları ----------------------------------------------
document.querySelectorAll('.demo-btns button').forEach(b=>{
  b.addEventListener('click', ()=> scenario(b.dataset.scn));
});

// ---- Ana döngü ----------------------------------------------------
// Gerçek API için: bu satırı `fetch('/api/status').then(r=>r.json()).then(render)` ile değiştir.
render(Sim.snapshot());
setInterval(()=> render(Sim.tick()), 2000);

// ---- Service worker (çevrimdışı / PWA) ----------------------------
if('serviceWorker' in navigator){
  window.addEventListener('load', ()=> navigator.serviceWorker.register('sw.js').catch(()=>{}));
}
