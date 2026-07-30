function tick(){
const d=new Date();
document.getElementById('clock').textContent=d.toLocaleTimeString([], {hour:'numeric',minute:'2-digit'});
}
tick();
setInterval(tick,1000);
