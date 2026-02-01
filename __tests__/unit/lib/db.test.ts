import { describe, it, expect } from 'vitest';
import {
  generateApiKey,
  generateClaimToken,
  generateVerificationCode,
  getCDRate,
  INTEREST_RATES,
  WITHDRAWAL_LIMITS,
  MIN_BALANCES,
  WELCOME_BONUS,
} from '@/lib/db';

describe('lib/db.ts', () => {
  describe('Constants', () => {
    describe('INTEREST_RATES', () => {
      it('should have correct checking rate (0.5% APY)', () => {
        expect(INTEREST_RATES.checking).toBe(0.005);
      });

      it('should have correct savings rate (3.5% APY)', () => {
        expect(INTEREST_RATES.savings).toBe(0.035);
      });

      it('should have correct money market rate (4.5% APY)', () => {
        expect(INTEREST_RATES.money_market).toBe(0.045);
      });

      it('should have correct CD rates', () => {
        expect(INTEREST_RATES.cd_3).toBe(0.05);
        expect(INTEREST_RATES.cd_6).toBe(0.055);
        expect(INTEREST_RATES.cd_12).toBe(0.06);
      });

      it('should have CD rates higher than regular accounts', () => {
        expect(INTEREST_RATES.cd_3).toBeGreaterThan(INTEREST_RATES.money_market);
        expect(INTEREST_RATES.cd_6).toBeGreaterThan(INTEREST_RATES.cd_3);
        expect(INTEREST_RATES.cd_12).toBeGreaterThan(INTEREST_RATES.cd_6);
      });
    });

    describe('WITHDRAWAL_LIMITS', () => {
      it('should have no limit for checking (null)', () => {
        expect(WITHDRAWAL_LIMITS.checking).toBeNull();
      });

      it('should have 6 withdrawals/month for savings', () => {
        expect(WITHDRAWAL_LIMITS.savings).toBe(6);
      });

      it('should have 3 withdrawals/month for money market', () => {
        expect(WITHDRAWAL_LIMITS.money_market).toBe(3);
      });

      it('should have 0 withdrawals for CD (until maturity)', () => {
        expect(WITHDRAWAL_LIMITS.cd).toBe(0);
      });
    });

    describe('MIN_BALANCES', () => {
      it('should have $0 minimum for checking', () => {
        expect(MIN_BALANCES.checking).toBe(0);
      });

      it('should have $100 minimum for savings', () => {
        expect(MIN_BALANCES.savings).toBe(100);
      });

      it('should have $2500 minimum for money market', () => {
        expect(MIN_BALANCES.money_market).toBe(2500);
      });

      it('should have $500 minimum for CD', () => {
        expect(MIN_BALANCES.cd).toBe(500);
      });
    });

    describe('WELCOME_BONUS', () => {
      it('should be $10,000', () => {
        expect(WELCOME_BONUS).toBe(10000.0);
      });
    });
  });

  describe('Helper Functions', () => {
    describe('generateApiKey()', () => {
      it('should start with "agentbank_" prefix', () => {
        const key = generateApiKey();
        expect(key.startsWith('agentbank_')).toBe(true);
      });

      it('should be 42 characters total (10 prefix + 32 random)', () => {
        const key = generateApiKey();
        expect(key.length).toBe(42);
      });

      it('should only contain alphanumeric characters after prefix', () => {
        const key = generateApiKey();
        const randomPart = key.slice(10);
        expect(randomPart).toMatch(/^[A-Za-z0-9]+$/);
      });

      it('should generate unique keys', () => {
        const keys = new Set<string>();
        for (let i = 0; i < 100; i++) {
          keys.add(generateApiKey());
        }
        expect(keys.size).toBe(100);
      });
    });

    describe('generateClaimToken()', () => {
      it('should be 24 characters long', () => {
        const token = generateClaimToken();
        expect(token.length).toBe(24);
      });

      it('should only contain alphanumeric characters', () => {
        const token = generateClaimToken();
        expect(token).toMatch(/^[A-Za-z0-9]+$/);
      });

      it('should generate unique tokens', () => {
        const tokens = new Set<string>();
        for (let i = 0; i < 100; i++) {
          tokens.add(generateClaimToken());
        }
        expect(tokens.size).toBe(100);
      });
    });

    describe('generateVerificationCode()', () => {
      it('should follow WORD-CODE format', () => {
        const code = generateVerificationCode();
        expect(code).toMatch(/^[A-Z]{4}-[A-Z0-9]{4}$/);
      });

      it('should use one of the predefined words', () => {
        const validWords = ['BANK', 'CASH', 'SAVE', 'FUND', 'GOLD', 'COIN'];
        const code = generateVerificationCode();
        const word = code.split('-')[0];
        expect(validWords).toContain(word);
      });

      it('should have a 4-character code after the word', () => {
        const code = generateVerificationCode();
        const codePart = code.split('-')[1];
        expect(codePart.length).toBe(4);
      });
    });

    describe('getCDRate()', () => {
      it('should return 5.0% for 3-month CD', () => {
        expect(getCDRate(3)).toBe(0.05);
      });

      it('should return 5.5% for 6-month CD', () => {
        expect(getCDRate(6)).toBe(0.055);
      });

      it('should return 6.0% for 12-month CD', () => {
        expect(getCDRate(12)).toBe(0.06);
      });

      it('should throw error for invalid term (1 month)', () => {
        expect(() => getCDRate(1)).toThrow('Invalid CD term');
      });

      it('should throw error for invalid term (9 months)', () => {
        expect(() => getCDRate(9)).toThrow('Invalid CD term');
      });

      it('should throw error for invalid term (24 months)', () => {
        expect(() => getCDRate(24)).toThrow('Invalid CD term');
      });
    });
  });

  describe('Financial Calculations', () => {
    describe('Daily Interest', () => {
      it('should calculate correct daily interest for checking (0.5% APY)', () => {
        const principal = 10000;
        const annualRate = INTEREST_RATES.checking;
        const dailyInterest = principal * (annualRate / 365);

        // $10,000 at 0.5% APY = ~$0.137 per day
        expect(dailyInterest).toBeCloseTo(0.137, 2);
      });

      it('should calculate correct daily interest for savings (3.5% APY)', () => {
        const principal = 10000;
        const annualRate = INTEREST_RATES.savings;
        const dailyInterest = principal * (annualRate / 365);

        // $10,000 at 3.5% APY = ~$0.959 per day
        expect(dailyInterest).toBeCloseTo(0.959, 2);
      });

      it('should calculate correct daily interest for 12-month CD (6% APY)', () => {
        const principal = 10000;
        const annualRate = INTEREST_RATES.cd_12;
        const dailyInterest = principal * (annualRate / 365);

        // $10,000 at 6% APY = ~$1.644 per day
        expect(dailyInterest).toBeCloseTo(1.644, 2);
      });
    });

    describe('CD Early Withdrawal Penalty', () => {
      it('should calculate 3 months interest penalty', () => {
        const principal = 10000;
        const annualRate = INTEREST_RATES.cd_12;
        const threeMonthsPenalty = principal * (annualRate / 12) * 3;

        // 3 months of 6% APY on $10,000 = $150
        expect(threeMonthsPenalty).toBe(150);
      });

      it('should cap penalty at earned interest when less than 3 months', () => {
        const principal = 10000;
        const annualRate = INTEREST_RATES.cd_12;
        const earnedInterest = 50; // Only earned $50
        const threeMonthsPenalty = principal * (annualRate / 12) * 3;

        const actualPenalty = Math.min(earnedInterest, threeMonthsPenalty);
        expect(actualPenalty).toBe(50);
      });
    });
  });
});
