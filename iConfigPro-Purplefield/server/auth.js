/* BTP / XSUAA resource-server authentication. */
const configuredMode=String(process.env.AUTH_MODE||(process.env.VCAP_SERVICES?'xsuaa':'none')).trim().toLowerCase();
// Local is an accepted alias for the existing unauthenticated local-development mode.
// It is normalized to `none` so older .env files do not prevent startup.
const mode=configuredMode==='local'?'none':configuredMode;
const enabled=mode==='xsuaa';
function failStartup(message){throw new Error(`[auth] ${message}`);}
function configure(app){
  if(!enabled){
    if(mode!=='none')failStartup(`Unsupported AUTH_MODE=${mode}. Use xsuaa or none.`);
    if(String(process.env.NODE_ENV).toLowerCase()==='production')failStartup('AUTH_MODE=none is not permitted in production. Bind XSUAA and use AUTH_MODE=xsuaa.');
    return;
  }
  let passport,JWTStrategy,xsenv,xsuaa;
  try{
    passport=require('passport');
    ({JWTStrategy}=require('@sap/xssec'));
    xsenv=require('@sap/xsenv');
    xsuaa=xsenv.getServices({xsuaa:{tag:'xsuaa'}}).xsuaa;
  }catch(error){failStartup(`XSUAA configuration is unavailable: ${error.message}`);}
  if(!xsuaa)failStartup('No XSUAA binding was found. Bind the xsuaa service instance to this application.');
  passport.use('JWT',new JWTStrategy(xsuaa));
  app.use(passport.initialize());
  app.use(passport.authenticate('JWT',{session:false}));
}
function requireScope(scope){return (req,res,next)=>{
  if(!enabled)return next();
  const context=req.authInfo||req.user;
  if(context&&typeof context.checkLocalScope==='function'&&context.checkLocalScope(scope))return next();
  return res.status(403).json({error:`Forbidden: missing required scope ${scope}`});
};}
module.exports={mode,enabled,configure,requireScope};
