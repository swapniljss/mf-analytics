import { useState } from 'react'
import apiClient from '../api/client'

// ── helpers ────────────────────────────────────────────────────────────────

function formatINR(v: number) {
  if (v >= 10000000) return `₹${(v / 10000000).toFixed(2)}Cr`
  if (v >= 100000)   return `₹${(v / 100000).toFixed(2)}L`
  if (v >= 1000)     return `₹${(v / 1000).toFixed(1)}K`
  return `₹${v.toFixed(0)}`
}

function InputField({
  label, value, onChange, min, max, step, prefix,
}: {
  label: string
  value: string | number
  onChange: (v: string) => void
  min?: number
  max?: number
  step?: number
  prefix?: string
}) {
  return (
    <div>
      <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">{label}</label>
      <div className="relative">
        {prefix && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-400 text-sm">{prefix}</span>
        )}
        <input
          type="number"
          min={min}
          max={max}
          step={step ?? 1}
          value={value}
          onChange={e => onChange(e.target.value)}
          className={`w-full border border-gray-200 dark:border-gray-700 rounded-lg py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${prefix ? 'pl-8 pr-3' : 'px-3'}`}
        />
      </div>
    </div>
  )
}

function KpiCard({ label, value, sub, highlight }: { label: string; value: string; sub?: string; highlight?: boolean }) {
  return (
    <div className={`rounded-lg p-4 border ${highlight ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 dark:bg-gray-800/50 border-gray-100 dark:border-gray-800'}`}>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</p>
      <p className={`text-xl font-bold ${highlight ? 'text-blue-700 dark:text-blue-300' : 'text-gray-900 dark:text-white'}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 dark:text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

// ── Lumpsum Tab ────────────────────────────────────────────────────────────

function LumpsumTab() {
  const [amount, setAmount] = useState('100000')
  const [rate, setRate] = useState('12')
  const [years, setYears] = useState('10')
  const [taxRate, setTaxRate] = useState('10')
  const [result, setResult] = useState<null | {
    future_value: number
    total_gain: number
    tax_on_gains: number
    post_tax_value: number
    inflation_adjusted_value: number
    wealth_ratio: number
  }>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function calculate() {
    setLoading(true)
    setError(null)
    try {
      const { data } = await apiClient.get('/analytics/goal/lumpsum', {
        params: {
          amount: Number(amount),
          rate: Number(rate),
          years: Number(years),
          tax_rate: Number(taxRate),
        },
      })
      setResult(data)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Calculation failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="card">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Lumpsum Investment</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <InputField label="Initial Amount (₹)" value={amount} onChange={setAmount} min={1000} prefix="₹" />
          <InputField label="Expected Return (%)" value={rate} onChange={setRate} min={1} max={50} step={0.5} />
          <InputField label="Years" value={years} onChange={setYears} min={1} max={40} />
          <InputField label="Tax Rate (%)" value={taxRate} onChange={setTaxRate} min={0} max={30} step={0.5} />
        </div>
        <div className="mt-4">
          <button
            onClick={calculate}
            disabled={loading}
            className="btn-primary disabled:opacity-40"
          >
            {loading ? 'Calculating…' : 'Calculate'}
          </button>
        </div>
        {error && (
          <p className="mt-3 text-xs text-red-600 dark:text-red-400">{error}</p>
        )}
      </div>

      {result && (
        <div className="card">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Results</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            <KpiCard label="Future Value" value={formatINR(result.future_value)} highlight />
            <KpiCard label="Total Gain" value={formatINR(result.total_gain)} />
            <KpiCard label="Tax on Gains" value={formatINR(result.tax_on_gains)} />
            <KpiCard label="Post-Tax Value" value={formatINR(result.post_tax_value)} />
            <KpiCard label="Inflation-Adj. Value" value={formatINR(result.inflation_adjusted_value)} />
            <KpiCard
              label="Wealth Ratio"
              value={`${result.wealth_ratio.toFixed(2)}x`}
              sub={`on ₹${Number(amount).toLocaleString('en-IN')}`}
            />
          </div>
        </div>
      )}
    </div>
  )
}

// ── SIP Tab ────────────────────────────────────────────────────────────────

function SipTab() {
  const [monthly, setMonthly] = useState('10000')
  const [rate, setRate] = useState('12')
  const [years, setYears] = useState('10')
  const [stepUp, setStepUp] = useState('0')
  const [result, setResult] = useState<null | {
    total_invested: number
    future_value: number
    total_gain: number
    wealth_ratio: number
  }>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function calculate() {
    setLoading(true)
    setError(null)
    try {
      const { data } = await apiClient.get('/analytics/goal/sip', {
        params: {
          monthly_amount: Number(monthly),
          rate: Number(rate),
          years: Number(years),
          step_up: Number(stepUp),
        },
      })
      setResult(data)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Calculation failed')
    } finally {
      setLoading(false)
    }
  }

  const progressPct = result
    ? Math.min(100, (result.total_invested / result.future_value) * 100)
    : 0

  return (
    <div className="space-y-6">
      <div className="card">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">SIP Calculator</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <InputField label="Monthly Amount (₹)" value={monthly} onChange={setMonthly} min={500} prefix="₹" />
          <InputField label="Expected Return (%)" value={rate} onChange={setRate} min={1} max={50} step={0.5} />
          <InputField label="Tenure (years)" value={years} onChange={setYears} min={1} max={40} />
          <InputField label="Annual Step-up (%)" value={stepUp} onChange={setStepUp} min={0} max={50} step={0.5} />
        </div>
        <div className="mt-4">
          <button
            onClick={calculate}
            disabled={loading}
            className="btn-primary disabled:opacity-40"
          >
            {loading ? 'Calculating…' : 'Calculate'}
          </button>
        </div>
        {error && (
          <p className="mt-3 text-xs text-red-600 dark:text-red-400">{error}</p>
        )}
      </div>

      {result && (
        <div className="card space-y-4">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Results</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <KpiCard label="Total Invested" value={formatINR(result.total_invested)} />
            <KpiCard label="Future Value" value={formatINR(result.future_value)} highlight />
            <KpiCard label="Total Gain" value={formatINR(result.total_gain)} />
            <KpiCard label="Wealth Ratio" value={`${result.wealth_ratio.toFixed(2)}x`} />
          </div>
          <div>
            <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
              <span>Invested: {formatINR(result.total_invested)}</span>
              <span>Gains: {formatINR(result.total_gain)}</span>
            </div>
            <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-3 overflow-hidden">
              <div
                className="bg-green-500 h-3 rounded-full transition-all duration-500"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <p className="text-xs text-gray-400 dark:text-gray-400 mt-1 text-right">
              Invested portion: {progressPct.toFixed(1)}% of future value
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Retirement Tab ─────────────────────────────────────────────────────────

function RetirementTab() {
  const [currentAge, setCurrentAge] = useState('30')
  const [retirementAge, setRetirementAge] = useState('60')
  const [monthlyExpense, setMonthlyExpense] = useState('50000')
  const [corpusYears, setCorpusYears] = useState('25')
  const [expectedReturn, setExpectedReturn] = useState('12')
  const [postRetirementReturn, setPostRetirementReturn] = useState('7')
  const [inflation, setInflation] = useState('6')
  const [result, setResult] = useState<null | {
    corpus_needed: number
    monthly_sip_needed: number
    future_monthly_expense_at_retirement: number
  }>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function calculate() {
    setLoading(true)
    setError(null)
    try {
      const { data } = await apiClient.get('/analytics/goal/retirement', {
        params: {
          current_age: Number(currentAge),
          retirement_age: Number(retirementAge),
          monthly_expense: Number(monthlyExpense),
          corpus_years: Number(corpusYears),
          expected_return: Number(expectedReturn),
          post_retirement_return: Number(postRetirementReturn),
          inflation: Number(inflation),
        },
      })
      setResult(data)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Calculation failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="card">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Retirement Planning</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <InputField label="Current Age" value={currentAge} onChange={setCurrentAge} min={18} max={60} />
          <InputField label="Retirement Age" value={retirementAge} onChange={setRetirementAge} min={40} max={80} />
          <InputField label="Monthly Expenses (₹)" value={monthlyExpense} onChange={setMonthlyExpense} min={1000} prefix="₹" />
          <InputField label="Corpus Sustain (years)" value={corpusYears} onChange={setCorpusYears} min={5} max={50} />
          <InputField label="Expected Return (%)" value={expectedReturn} onChange={setExpectedReturn} min={1} max={30} step={0.5} />
          <InputField label="Post-Retirement Return (%)" value={postRetirementReturn} onChange={setPostRetirementReturn} min={1} max={20} step={0.5} />
          <InputField label="Inflation (%)" value={inflation} onChange={setInflation} min={1} max={20} step={0.5} />
        </div>
        <div className="mt-4">
          <button
            onClick={calculate}
            disabled={loading}
            className="btn-primary disabled:opacity-40"
          >
            {loading ? 'Calculating…' : 'Calculate'}
          </button>
        </div>
        {error && (
          <p className="mt-3 text-xs text-red-600 dark:text-red-400">{error}</p>
        )}
      </div>

      {result && (
        <div className="space-y-4">
          {/* Large corpus card */}
          <div className="card bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200">
            <p className="text-sm text-blue-600 dark:text-blue-400 font-medium">Corpus Needed at Retirement</p>
            <p className="text-4xl font-bold text-blue-900 mt-2">{formatINR(result.corpus_needed)}</p>
            <p className="text-xs text-blue-400 mt-1">
              To sustain {corpusYears} years of post-retirement expenses
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <KpiCard
              label="Monthly SIP Needed"
              value={formatINR(result.monthly_sip_needed)}
              sub={`Start now to build corpus in ${Number(retirementAge) - Number(currentAge)} years`}
              highlight
            />
            <KpiCard
              label="Future Monthly Expense at Retirement"
              value={formatINR(result.future_monthly_expense_at_retirement)}
              sub={`Inflation-adjusted from ₹${Number(monthlyExpense).toLocaleString('en-IN')}/month today`}
            />
          </div>
        </div>
      )}
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────

type GoalTab = 'lumpsum' | 'sip' | 'retirement'

export default function GoalCalculatorPage() {
  const [tab, setTab] = useState<GoalTab>('lumpsum')

  const tabs: { id: GoalTab; label: string }[] = [
    { id: 'lumpsum', label: 'Lumpsum' },
    { id: 'sip', label: 'SIP' },
    { id: 'retirement', label: 'Retirement Planning' },
  ]

  return (
    <div className="p-6 space-y-4">
      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              tab === t.id
                ? 'border border-b-white border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-blue-600 dark:text-blue-400 -mb-px'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'lumpsum'    && <LumpsumTab />}
      {tab === 'sip'        && <SipTab />}
      {tab === 'retirement' && <RetirementTab />}
    </div>
  )
}
