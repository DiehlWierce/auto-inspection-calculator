export interface ReservePlan {
  plannedReserve: number[];
  reserveBalance: number[];
}

export function calculateReserve(repairOutflow: number[]): ReservePlan {
  const totalMonths = repairOutflow.length;
  const plannedReserve = Array.from({ length: totalMonths }, () => 0);
  const reserveBalance = Array.from({ length: totalMonths }, () => 0);
  let remaining = repairOutflow.reduce((sum, value) => sum + value, 0);
  let balance = 0;
  for (let index = 0; index < totalMonths; index += 1) {
    plannedReserve[index] = remaining / (totalMonths - index);
    balance += plannedReserve[index] - repairOutflow[index];
    reserveBalance[index] = balance;
    remaining -= repairOutflow[index];
  }
  return { plannedReserve, reserveBalance };
}
