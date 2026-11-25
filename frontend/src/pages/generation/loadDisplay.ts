import { loadAverage, hasBandValues, valuesDayAverage } from '../sheets/loads'
import { loadKva, logLoads, type GeneratorLog } from './model'

export function generatorLoadSummary(log:GeneratorLog,capacity:number|null|undefined,voltage:number){
 const carried=logLoads(log)
 const peak=carried?Math.max(...carried.loads.filter((v):v is number=>v!==null)):null
 const average=hasBandValues(log.bandLoads)?valuesDayAverage(log.bandLoads):carried?loadAverage(carried.loads):null
 const kva=carried?loadKva(carried.loads,log.loadUnit,voltage):null
 return {peak,average,kva,percent:kva!==null && capacity && capacity>0?kva/capacity*100:null,hourly:!!carried && !carried.byPhase}
}
