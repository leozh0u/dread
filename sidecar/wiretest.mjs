// Fakes the browser: connects and pushes synthetic RGBA frames.
import { WebSocket } from 'ws'
const W=480,H=360,HDR=12
const ws = new WebSocket('ws://localhost:8787')
let sent=0
ws.on('open',()=>{
  console.log('TEST connected, pushing frames')
  const buf=Buffer.alloc(HDR+W*H*4)
  buf.writeUInt16LE(W,0); buf.writeUInt16LE(H,2)
  const t0=Date.now()
  const iv=setInterval(()=>{
    // moving gradient so it isn't a constant image
    const phase=(Date.now()-t0)/50
    for(let i=0;i<W*H;i++){
      const o=HDR+i*4
      buf[o]=(i+phase)&255; buf[o+1]=(i*3+phase)&255; buf[o+2]=(i*7)&255; buf[o+3]=255
    }
    buf.writeDoubleLE((Date.now()-t0)*1000+sent,4)
    ws.send(buf); sent++
  },42)
  setTimeout(()=>{clearInterval(iv);console.log('TEST sent',sent,'frames');ws.close();process.exit(0)},25000)
})
ws.on('error',e=>{console.log('TEST ws error',e.message);process.exit(1)})
