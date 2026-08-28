import { useState } from 'react';
import { money, percent } from '../../utils';
import type { ForecastResult, MonthForecast } from '../../types';

const risk = (value: number | null) => value === null ? '—' : percent(value);
const riskClass = (value: number | null) => value === null ? 'table-pending' : value > 0 ? 'table-warn' : 'table-good';

export function ForecastBreakdown({ forecast }: { forecast: ForecastResult }) {
  const [expandedYears, setExpandedYears] = useState<Record<number, boolean>>({ 1: true });
  const toggleYear = (year: number) => setExpandedYears((current) => ({ ...current, [year]: !current[year] }));
  return <div className="forecast-breakdown">
    <div className="table-scroll"><table className="year-summary-table">
      <thead><tr><th>Год</th><th>Регулярные расходы</th><th>В резерв</th><th>Плановый бюджет</th><th>Отложенные работы</th><th>События</th><th>Ожидаемо всего</th><th>P80 всего</th><th>Крупный ремонт</th><th>Риск лимита</th></tr></thead>
      {forecast.years.map((year) => {
        const months = forecast.months.filter((month) => month.year === year.year);
        const regular = months.reduce((sum, month) => sum + month.regularExpenses, 0);
        const reserve = months.reduce((sum, month) => sum + month.plannedReserve, 0);
        const planned = months.reduce((sum, month) => sum + month.plannedBudget, 0);
        return <tbody key={year.year}>
          <tr>
            <td><button className="year-toggle" onClick={() => toggleYear(year.year)}>{expandedYears[year.year] ? '−' : '+'} Год {year.year}</button></td>
            <td>{money(regular)}</td>
            <td>{money(reserve)}</td>
            <td className="forecast-plan-cell">{money(planned)}</td>
            <td>{money(year.deferredFacts)}</td>
            <td>{money(year.expectedRepairs)}</td>
            <td><strong>{money(year.expectedTotal)}</strong></td>
            <td className="forecast-p80-cell">{money(year.p80Total)}</td>
            <td><span className={riskClass(year.probabilityAnyMajorRepair)}>{risk(year.probabilityAnyMajorRepair)}</span></td>
            <td><span className={riskClass(year.probabilityLimitViolation)}>{risk(year.probabilityLimitViolation)}</span></td>
          </tr>
          {expandedYears[year.year] && <tr><td colSpan={10}><MonthlyForecastTable months={months} /></td></tr>}
        </tbody>;
      })}
    </table></div>
    <p className="forecast-footnote">«Плановый бюджет» — регулярные расходы плюс равномерное отчисление в резерв на все будущие ремонты. «Ожидаемо всего» — средние расходы, «P80 всего» — расходы в неудачном сценарии: они выше среднего, потому что редкие крупные ремонты сдвигают хвост распределения.</p>
  </div>;
}

export function MonthlyForecastTable({ months }: { months: MonthForecast[] }) {
  return <div className="monthly-table-wrap"><table className="monthly-table">
    <thead><tr><th>Месяц</th><th>Бензин</th><th>ОСАГО</th><th>Налог</th><th>Плановое ТО</th><th>Жидкости</th><th>Расходники</th><th>Резина</th><th>Мойка</th><th>Штрафы</th><th>Регулярно</th><th>В резерв</th><th>Плановый бюджет</th><th>Отложенные</th><th>По сроку</th><th>Риски, ожидаемо</th><th>Всего</th><th>P50</th><th>P80</th><th>Баланс резерва</th></tr></thead>
    <tbody>{months.map((month) => <tr key={month.month}>
      <td><strong>{month.month}</strong></td>
      <td>{money(month.fuel)}</td>
      <td>{money(month.insurance)}</td>
      <td>{money(month.tax)}</td>
      <td>{money(month.service)}</td>
      <td>{money(month.fluids)}</td>
      <td>{money(month.consumables)}</td>
      <td>{money(month.tires)}</td>
      <td>{money(month.washing)}</td>
      <td>{money(month.fines)}</td>
      <td>{money(month.regularExpenses)}</td>
      <td className="reserve-cell">{money(month.plannedReserve)}</td>
      <td className="forecast-plan-cell">{money(month.plannedBudget)}</td>
      <td>{month.deferredFacts > 0 ? money(month.deferredFacts) : '—'}</td>
      <td>{month.scheduledEvents > 0 ? money(month.scheduledEvents) : '—'}</td>
      <td>{month.expectedRepairs > 0 ? money(month.expectedRepairs) : '—'}</td>
      <td><strong>{money(month.expectedTotal)}</strong></td>
      <td>{money(month.p50Total)}</td>
      <td className="forecast-p80-cell">{money(month.p80Total)}</td>
      <td className={month.reserveBalance < 0 ? 'table-warn' : 'table-good'}>{money(month.reserveBalance)}</td>
    </tr>)}</tbody>
  </table></div>;
}
