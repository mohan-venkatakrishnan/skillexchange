import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PageWrap, VerifiedStamp, Stars, SkillBdg, PTag, SellerBdg, Loading, ErrorBox } from '../components/Shared.jsx';
import { Ic } from '../components/Icons.jsx';
import * as api from '../lib/api.js';
import useFetch from '../lib/useFetch.js';

export default function SkillDetailPage({ T, user, onShowAuth }) {
  const { id } = useParams();
  const nav = useNavigate();
  const skill = useFetch(() => api.getSkill(id), [id]);
  const reviews = useFetch(() => api.getReviews(id), [id]);
  // Ownership is unknown until the library loads — never flash the wrong button.
  const [owned, setOwned] = useState({ known: false, value: false });
  const [buying, setBuying] = useState(false);
  const [buyError, setBuyError] = useState("");
  const [userRating, setUserRating] = useState(0);
  const [reviewText, setReviewText] = useState("");
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewDone, setReviewDone] = useState(false);
  const [reviewError, setReviewError] = useState("");

  useEffect(() => {
    let alive = true;
    if (!user) { setOwned({ known: true, value: false }); return; }
    setOwned({ known: false, value: false });
    api.getLibrary().then(
      lib => alive && setOwned({ known: true, value: lib.some(s => String(s.id) === String(id)) }),
      () => alive && setOwned({ known: true, value: false }),
    );
    return () => { alive = false; };
  }, [user, id]);

  if (skill.loading) return <PageWrap><Loading T={T} verb="Loading skill"/></PageWrap>;
  if (skill.error) return <PageWrap><ErrorBox T={T} message={skill.error} onRetry={skill.retry}/></PageWrap>;
  const s = skill.data;
  const isFree = s.price === 0;
  const canDownload = isFree || owned.value;

  const doDownload = async () => {
    if (!user) { onShowAuth(); return; }
    setBuyError("");
    try {
      const { url } = await api.downloadSkill(s.id);
      setOwned({ known: true, value: true });
      const a = document.createElement('a');
      a.href = url; a.download = `${s.title.replace(/[^a-z0-9]+/gi, '-')}-SKILL.md`;
      document.body.appendChild(a); a.click(); a.remove();
    } catch (e) { setBuyError(e.message); }
  };

  const doBuy = async () => {
    if (!user) { onShowAuth(); return; }
    setBuying(true); setBuyError("");
    try {
      const order = await api.buySkill(s.id);
      if (order.status === 'paid-mock') { setOwned({ known: true, value: true }); return; }
      await openRazorpay(order, s, user);
      setOwned({ known: true, value: true });
    } catch (e) {
      if (e?.message !== 'cancelled') setBuyError(e.message || 'Payment failed. You have not been charged.');
    } finally { setBuying(false); }
  };

  const submitReview = async () => {
    if (!userRating) { setReviewError('Pick a star rating first.'); return; }
    setReviewBusy(true); setReviewError("");
    try {
      await api.postReview(s.id, { rating: userRating, text: reviewText.trim() });
      setReviewDone(true); setReviewText(""); setUserRating(0);
      reviews.retry();
    } catch (e) { setReviewError(e.message); }
    finally { setReviewBusy(false); }
  };

  return (
    <PageWrap>
      <div style={{padding:"28px clamp(16px,4vw,40px)",maxWidth:900,margin:"0 auto"}}>
        <button onClick={()=>nav("/marketplace")} style={{background:"none",border:"none",color:T.muted,fontFamily:"Inter",fontSize:13,cursor:"pointer",marginBottom:18,padding:0}}>← Back</button>
        <div style={{display:"flex",gap:32,flexWrap:"wrap"}}>
          <div style={{flex:"1 1 320px"}}>
            <div style={{display:"flex",alignItems:"flex-start",gap:10,marginBottom:10}}>
              <div style={{flex:1}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                  <span style={{fontFamily:"Inter",fontSize:10,fontWeight:600,color:T.slate,textTransform:"uppercase",letterSpacing:"0.07em"}}>{s.category}</span>
                  {s.skillBadge&&<SkillBdg label={s.skillBadge} T={T}/>}
                </div>
                <h1 style={{fontFamily:"Playfair Display",fontSize:"clamp(20px,3vw,24px)",color:T.text,margin:"0 0 8px"}}>{s.title}</h1>
              </div>
              {s.verified&&<VerifiedStamp size={32} T={T}/>}
            </div>
            <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12,flexWrap:"wrap"}}>
              <Stars rating={s.rating} count={s.reviews} T={T}/>
              <span style={{fontFamily:"Inter",fontSize:12,color:T.muted}}>{s.downloads} downloads</span>
              <span style={{fontFamily:"Inter",fontSize:12,color:T.muted}}>by <span onClick={()=>nav(`/u/${s.author}`)} style={{color:T.gold,cursor:"pointer"}}>{s.author}</span></span>
            </div>
            {s.timeSaved&&(
              <div style={{background:T.goldSoft,border:`1px solid ${T.gold}28`,borderRadius:10,padding:"10px 14px",marginBottom:16,display:"inline-flex",alignItems:"center",gap:8}}>
                <Ic.Clock s={16} c={T.gold}/>
                <span style={{fontFamily:"Inter",fontSize:14,fontWeight:600,color:T.gold}}>~{s.timeSaved} hours saved</span>
                <span style={{fontFamily:"Inter",fontSize:11,color:T.muted}}>· seller estimate</span>
              </div>
            )}
            <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:18}}>{s.platforms.map(p=><PTag key={p} p={p} T={T}/>)}{s.sellerBadges.map(b=><SellerBdg key={b} b={b} T={T}/>)}</div>
            <p style={{fontFamily:"Inter",fontSize:14,color:T.muted,lineHeight:1.7,marginBottom:20}}>{s.description}</p>
            <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:10,padding:16,marginBottom:14}}>
              <h3 style={{fontFamily:"Inter",fontSize:11,fontWeight:700,color:T.gold,margin:"0 0 8px",textTransform:"uppercase",letterSpacing:"0.06em"}}>How to use this skill</h3>
              <p style={{fontFamily:"Inter",fontSize:13,color:T.muted,lineHeight:1.6,margin:0}}>{s.usage}</p>
            </div>
            <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:10,padding:16,marginBottom:22}}>
              <h3 style={{fontFamily:"Inter",fontSize:11,fontWeight:700,color:T.gold,margin:"0 0 10px",textTransform:"uppercase",letterSpacing:"0.06em"}}>Proof of Concept</h3>
              {s.pocScreenshot&&(s.pocScreenshotUrl
                ?<img src={s.pocScreenshotUrl} alt={`${s.title} proof of concept`} style={{width:"100%",maxHeight:220,objectFit:"cover",borderRadius:8,marginBottom:10,border:`1px solid ${T.borderSub}`}}/>
                :<div style={{background:T.elevated,borderRadius:8,height:100,display:"flex",alignItems:"center",justifyContent:"center",marginBottom:10,border:`1px solid ${T.borderSub}`}}><span style={{fontFamily:"Inter",fontSize:12,color:T.muted}}>📸 Cover screenshot</span></div>
              )}
              <a href={s.pocUrl} target="_blank" rel="noreferrer" style={{fontFamily:"JetBrains Mono",fontSize:12,color:T.gold,textDecoration:"none"}}>{s.pocUrl} ↗</a>
            </div>

            <h3 style={{fontFamily:"Playfair Display",fontSize:18,color:T.text,marginBottom:14}}>Reviews</h3>
            {reviews.loading?<Loading T={T} verb="Loading reviews"/>
              :reviews.error?<ErrorBox T={T} message={reviews.error} onRetry={reviews.retry}/>
              :(reviews.data||[]).length===0?<p style={{fontFamily:"Inter",fontSize:13,color:T.muted}}>No reviews yet. {canDownload?"Be the first to review it below.":"Buy this skill to leave the first review."}</p>
              :(reviews.data||[]).map((r,i)=>(
                <div key={r.reviewId||i} style={{background:T.surface,border:`1px solid ${T.borderSub}`,borderRadius:8,padding:14,marginBottom:10}}>
                  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6}}>
                    <span onClick={()=>nav(`/u/${r.user}`)} style={{fontFamily:"Inter",fontSize:13,fontWeight:600,color:T.text,cursor:"pointer"}}>{r.user}</span>
                    <Stars rating={r.rating} T={T}/>
                  </div>
                  <p style={{fontFamily:"Inter",fontSize:13,color:T.muted,margin:0,lineHeight:1.5}}>{r.text}</p>
                </div>
              ))}

            {user&&owned.known&&canDownload&&!reviewDone&&(
              <div style={{background:T.surface,border:`1px solid ${T.borderSub}`,borderRadius:8,padding:14,marginTop:14}}>
                <h4 style={{fontFamily:"Inter",fontSize:13,fontWeight:600,color:T.text,margin:"0 0 10px"}}>Leave a review</h4>
                <div style={{display:"flex",gap:6,marginBottom:10}}>{[1,2,3,4,5].map(i=><span key={i} onClick={()=>setUserRating(i)} style={{cursor:"pointer"}} data-testid={`star-${i}`}><Ic.Star s={18} c={T.gold} filled={i<=userRating}/></span>)}</div>
                <textarea value={reviewText} onChange={e=>setReviewText(e.target.value)} placeholder="What worked well? What could be improved?" style={{width:"100%",background:T.elevated,border:`1px solid ${T.border}`,borderRadius:6,padding:10,color:T.text,fontFamily:"Inter",fontSize:13,resize:"vertical",minHeight:70,boxSizing:"border-box",outline:"none"}}/>
                {reviewError&&<p style={{fontFamily:"Inter",fontSize:12,color:T.coral,margin:"8px 0 0"}}>{reviewError}</p>}
                <button disabled={reviewBusy} onClick={submitReview} style={{marginTop:8,background:T.goldSoft,border:`1px solid ${T.gold}`,color:T.gold,borderRadius:6,padding:"7px 16px",fontFamily:"Inter",fontSize:13,cursor:reviewBusy?"wait":"pointer",opacity:reviewBusy?0.7:1}}>{reviewBusy?"Submitting…":"Submit Review"}</button>
              </div>
            )}
            {reviewDone&&<p style={{fontFamily:"Inter",fontSize:13,color:T.green,marginTop:14}}>✓ Review submitted — thank you.</p>}
          </div>

          {/* Sidebar */}
          <div style={{width:"min(215px,100%)",flexShrink:0}}>
            <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:14,padding:20,position:"sticky",top:20}}>
              <div style={{textAlign:"center",marginBottom:16}}>
                <div style={{fontFamily:"Inter",fontSize:30,fontWeight:700,color:isFree?T.green:T.gold}}>{isFree?"Free":`$${s.price}`}</div>
                <div style={{fontFamily:"Inter",fontSize:11,color:T.muted}}>one-time payment</div>
              </div>
              {!owned.known&&user
                ?<div style={{height:40,borderRadius:8,background:T.elevated,marginBottom:8,animation:"twinkle 1.4s ease-in-out infinite alternate","--op":0.6}}/>
                :canDownload
                  ?<button onClick={doDownload} data-testid="download-btn" style={{width:"100%",background:`linear-gradient(135deg,${T.green},#2a9a78)`,color:"#fff",border:"none",borderRadius:8,padding:"11px 0",fontFamily:"Inter",fontWeight:700,fontSize:13,cursor:"pointer",marginBottom:8,display:"flex",alignItems:"center",justifyContent:"center",gap:8}}><Ic.Download s={14} c="#fff"/>Download Skill</button>
                  :<button onClick={doBuy} disabled={buying} data-testid="buy-btn" style={{width:"100%",background:`linear-gradient(135deg,${T.gold},${T.goldDim})`,color:"#fff",border:"none",borderRadius:8,padding:"11px 0",fontFamily:"Inter",fontWeight:700,fontSize:13,cursor:buying?"wait":"pointer",marginBottom:8,opacity:buying?0.7:1}}>{buying?"Opening checkout…":`Buy for $${s.price}`}</button>
              }
              {buyError&&<p style={{fontFamily:"Inter",fontSize:11,color:T.coral,textAlign:"center",margin:"0 0 10px"}}>{buyError}</p>}
              <div style={{fontFamily:"Inter",fontSize:11,color:T.muted,textAlign:"center",marginBottom:14}}>Secure checkout · Instant download</div>
              <div style={{borderTop:`1px solid ${T.borderSub}`,paddingTop:14}}>
                {[["Category",s.category],["Time Saved",`~${s.timeSaved}h est.`],["Downloads",s.downloads],["Rating",`${s.rating}/5`],["Reviews",s.reviews]].map(([k,v])=>(
                  <div key={k} style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
                    <span style={{fontFamily:"Inter",fontSize:12,color:T.muted}}>{k}</span>
                    <span style={{fontFamily:"Inter",fontSize:12,color:k==="Time Saved"?T.gold:T.text,fontWeight:k==="Time Saved"?600:400}}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </PageWrap>
  );
}

// Load Razorpay checkout on demand; resolve on successful payment confirmation.
function openRazorpay(order, skill, user) {
  return new Promise((resolve, reject) => {
    const launch = () => {
      const rzp = new window.Razorpay({
        key: order.razorpayKeyId,
        order_id: order.razorpayOrderId,
        amount: order.amountCents, // Razorpay uses smallest currency unit
        currency: order.currency || 'USD',
        name: 'Skill Exchange',
        description: skill.title,
        prefill: { email: user.email },
        theme: { color: '#C9A84C' },
        handler: async (resp) => {
          try {
            await api.confirmPurchase(skill.id, {
              razorpayPaymentId: resp.razorpay_payment_id,
              razorpayOrderId: resp.razorpay_order_id,
              razorpaySignature: resp.razorpay_signature,
            });
            resolve();
          } catch (e) { reject(e); }
        },
        modal: { ondismiss: () => reject(new Error('cancelled')) },
      });
      rzp.open();
    };
    if (window.Razorpay) { launch(); return; }
    const scr = document.createElement('script');
    scr.src = 'https://checkout.razorpay.com/v1/checkout.js';
    scr.onload = launch;
    scr.onerror = () => reject(new Error("Couldn't load the payment window. Check your connection and retry."));
    document.body.appendChild(scr);
  });
}
