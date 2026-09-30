export type EvalCase={id:string;input:string;expectedIntent:string};
export type EvalResult={id:string;predictedIntent:string;passed:boolean};
export function evaluate(cases:EvalCase[],predict:(input:string)=>string):EvalResult[]{return cases.map(c=>{const predictedIntent=predict(c.input);return {id:c.id,predictedIntent,passed:predictedIntent===c.expectedIntent}})}
