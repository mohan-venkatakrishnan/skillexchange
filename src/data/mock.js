// ── MOCK DATA ── (verbatim from prototype; shapes match what lib/api.js
// returns in live mode after normalization — see normalizeSkill there.)
export const SKILLS=[
  {id:"1",title:"PDF Generation Skill",category:"Document",author:"mohan",price:5,rating:4.8,reviews:34,downloads:210,platforms:["Claude","ChatGPT"],verified:true,featured:true,skillBadge:"#1 in Document",timeSaved:6,description:"A complete SKILL.md for generating production-ready PDFs. Covers headers, footers, tables, and image embedding.",pocUrl:"https://tapdot.org",pocScreenshot:true,usage:"Place SKILL.md in your project root. Reference it in your Claude Code session before any PDF task.",sellerBadges:["Verified Creator","Top Seller"]},
  {id:"2",title:"Chrome Extension MV3 Skill",category:"Extension",author:"devkraft",price:8,rating:4.6,reviews:22,downloads:98,platforms:["Claude"],verified:true,featured:true,skillBadge:"Top Rated",timeSaved:12,description:"Everything for a MV3 Chrome extension — service worker, offscreen AI, keep-alive, storage schema, sidepanel wiring.",pocUrl:"https://github.com",pocScreenshot:true,usage:"Load into Claude Code at project start. Follow the phased build plan inside the skill.",sellerBadges:["Verified Creator"]},
  {id:"3",title:"React UI Design System Skill",category:"Design",author:"aiko_builds",price:0,rating:4.4,reviews:67,downloads:580,platforms:["Claude","ChatGPT","Gemini"],verified:false,featured:false,skillBadge:"Most Downloaded",timeSaved:8,description:"A free skill defining a complete token system — colors, typography, spacing, and component patterns.",pocUrl:"https://github.com",pocScreenshot:true,usage:"Reference before any UI component task. Works with all major AI assistants.",sellerBadges:[]},
  {id:"4",title:"Landing Page Copywriting Skill",category:"Marketing",author:"wordsmith_ai",price:3,rating:4.9,reviews:89,downloads:440,platforms:["ChatGPT","Claude","Gemini"],verified:true,featured:true,skillBadge:"#1 in Marketing",timeSaved:4,description:"Generates high-converting SaaS landing page copy — hero, features, pricing, FAQ, CTA.",pocUrl:"https://github.com",pocScreenshot:true,usage:"Paste your product brief into the skill template. AI handles the rest.",sellerBadges:["Top Seller","Verified Creator"]},
  {id:"5",title:"FastAPI Backend Scaffold Skill",category:"Coding",author:"backendguru",price:6,rating:4.2,reviews:15,downloads:72,platforms:["Claude","Cursor"],verified:false,featured:false,skillBadge:null,timeSaved:10,description:"Scaffolds a production FastAPI backend with auth, database models, migrations, and Docker setup.",pocUrl:"https://github.com",pocScreenshot:false,usage:"Run in a fresh project folder. Specify your data models in the skill config section.",sellerBadges:[]},
  {id:"6",title:"Electron Desktop App Skill",category:"Desktop",author:"mohan",price:4,rating:4.7,reviews:19,downloads:133,platforms:["Claude"],verified:true,featured:false,skillBadge:"New & Notable",timeSaved:16,description:"Full Electron + electron-builder + electron-updater skill. Covers auto-updates via GitHub Releases.",pocUrl:"https://tapdot.org",pocScreenshot:true,usage:"Use at project start in Claude Code. Covers the full desktop packaging lifecycle.",sellerBadges:["Verified Creator"]},
];

export const LB_BUILDERS=[
  {rank:1,name:"wordsmith_ai",sales:89,rating:4.9,badge:"Crown"},
  {rank:2,name:"mohan",sales:67,rating:4.8,badge:"Flame"},
  {rank:3,name:"devkraft",sales:44,rating:4.6,badge:"Gem"},
  {rank:4,name:"aiko_builds",sales:38,rating:4.4,badge:"Bolt"},
  {rank:5,name:"backendguru",sales:21,rating:4.2,badge:null},
];

export const LB_SKILLS=[
  {rank:1,skillId:"3",title:"React UI Design System Skill",author:"aiko_builds",downloads:580,rating:4.4,timeSaved:8},
  {rank:2,skillId:"4",title:"Landing Page Copywriting Skill",author:"wordsmith_ai",downloads:440,rating:4.9,timeSaved:4},
  {rank:3,skillId:"1",title:"PDF Generation Skill",author:"mohan",downloads:210,rating:4.8,timeSaved:6},
  {rank:4,skillId:"6",title:"Electron Desktop App Skill",author:"mohan",downloads:133,rating:4.7,timeSaved:16},
  {rank:5,skillId:"2",title:"Chrome Extension MV3 Skill",author:"devkraft",downloads:98,rating:4.6,timeSaved:12},
];

export const PROFILES={
  mohan:        {name:"Mohan",username:"mohan",bio:"Solo indie dev building privacy-first developer tools.",location:"Mumbai, India",badges:["Verified Creator","Top Seller"],verified:true},
  devkraft:     {name:"DevKraft",username:"devkraft",bio:"Chrome extension specialist. MV3 patterns and browser AI.",location:"Bangalore, India",badges:["Verified Creator"],verified:true},
  wordsmith_ai: {name:"WordsmithAI",username:"wordsmith_ai",bio:"Copywriting skills for SaaS and indie products.",location:"Remote",badges:["Top Seller","Verified Creator"],verified:true},
  aiko_builds:  {name:"Aiko Builds",username:"aiko_builds",bio:"Design systems and React UI patterns.",location:"Tokyo, Japan",badges:[],verified:false},
  backendguru:  {name:"BackendGuru",username:"backendguru",bio:"Python and FastAPI backend patterns.",location:"Remote",badges:[],verified:false},
};

export const REVIEWS={
  "1":[
    {reviewId:"r1",user:"devkraft",rating:5,text:"Saved me hours. The proof of concept alone was worth it."},
    {reviewId:"r2",user:"aiko_builds",rating:4,text:"Works great with Claude. Would love Gemini support."},
  ],
};

export const STATS={skills:"1,240+",downloads:"8,900+",builders:"430+",avgRating:"4.7★"};
