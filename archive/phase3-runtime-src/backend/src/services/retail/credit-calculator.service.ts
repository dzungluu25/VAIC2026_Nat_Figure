import { formatPercent } from "./retail-common";

export const roundToNearest100k = (value: number) => Math.round(value / 100000) * 100000;

export const calculateEmi = (principal: number, annualRate: number, termMonths: number) => {
  const monthlyRate = annualRate / 12;
  const factor = Math.pow(1 + monthlyRate, termMonths);
  return roundToNearest100k((principal * monthlyRate * factor) / (factor - 1));
};

export const applyIncomeHaircut = () => {
  const breakdown = [
    { source: "SALARY_VIA_SHB", declared: 55000000, haircutRate: 0, qualified: 55000000 },
    { source: "FREELANCE_UNVERIFIED", declared: 25000000, haircutRate: 0.5, qualified: 12500000 },
    { source: "RENTAL_WITH_CONTRACT", declared: 12000000, haircutRate: 0.3, qualified: 8400000 },
  ];

  return {
    qualifiedIncome: breakdown.reduce((sum, item) => sum + item.qualified, 0),
    breakdown,
  };
};

export const computeComplexCredit = () => {
  const { qualifiedIncome, breakdown } = applyIncomeHaircut();
  const currentAutoEmi = calculateEmi(450000000, 0.115, 36);
  const refinancedAutoEmi = calculateEmi(450000000, 0.095, 36);
  const currentCardObligation = 10000000;
  const restructuredCardObligation = 5000000;
  const requestedHomeEmiStress = calculateEmi(2800000000, 0.135, 300);
  const requestedDti = (requestedHomeEmiStress + currentAutoEmi + currentCardObligation) / qualifiedIncome;
  const restructuredHomeEmiPromo = calculateEmi(2250000000, 0.075, 360);
  const restructuredHomeEmiFloating = calculateEmi(2250000000, 0.115, 360);
  const restructuredHomeEmiStress = calculateEmi(2250000000, 0.135, 360);
  const stressTotal = restructuredHomeEmiStress + refinancedAutoEmi + restructuredCardObligation;
  const stressDti = stressTotal / qualifiedIncome;
  const ltv = 2250000000 / 3500000000;

  return {
    qualifiedIncome,
    breakdown,
    currentAutoEmi,
    refinancedAutoEmi,
    currentCardObligation,
    restructuredCardObligation,
    requestedHomeEmiStress,
    requestedDti,
    requestedDtiDisplay: formatPercent(requestedDti),
    restructuredHomeEmiPromo,
    restructuredHomeEmiFloating,
    restructuredHomeEmiStress,
    stressDti,
    stressDtiDisplay: formatPercent(stressDti),
    ltv,
    ltvDisplay: formatPercent(ltv),
  };
};
