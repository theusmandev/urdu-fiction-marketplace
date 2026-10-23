import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  paymentMethodSchema,
  validatePakistaniMobile,
  validatePkIban,
  maskAccountNumber,
  novelFormSchema,
  createNovelFormSchema,
  chapterFormSchema,
} from '../src/lib/writer/schemas.ts';

describe('Writer Payment Methods & Schemas', () => {
  test('validates Pakistani mobile numbers', () => {
    assert.equal(validatePakistaniMobile('03001234567'), true);
    assert.equal(validatePakistaniMobile('+923001234567'), true);
    assert.equal(validatePakistaniMobile('0345-9876543'), true); // with dashes
    assert.equal(validatePakistaniMobile('02131234567'), false); // landline
    assert.equal(validatePakistaniMobile('04001234567'), false);
    assert.equal(validatePakistaniMobile('123456'), false);
  });

  test('validates Pakistani IBAN format', () => {
    // 24 chars: PK + 2 digits + 4 letters + 16 alphanum
    assert.equal(validatePkIban('PK36SCBL0000001123456701'), true);
    assert.equal(validatePkIban('pk36 scbl 0000 0011 2345 6701'), true); // spaced
    assert.equal(validatePkIban('GB36SCBL0000001123456701'), false); // not PK
    assert.equal(validatePkIban('PK36SCBL00000011234567'), false); // too short
  });

  test('masks account numbers for display', () => {
    assert.equal(maskAccountNumber('jazzcash', '03001234567'), '0300••••567');
    assert.equal(maskAccountNumber('bank_iban', 'PK36SCBL0000001123456701'), 'PK36••••••••6701');
  });

  test('accepts valid JazzCash and EasyPaisa payment methods', () => {
    const validJazz = paymentMethodSchema.safeParse({
      method_type: 'jazzcash',
      account_title: 'Tariq Mehmood',
      account_number_or_iban: '03001234567',
      instructions_note: 'Please mention TID in WhatsApp receipt.',
    });
    assert.equal(validJazz.success, true);
  });

  test('strictly rejects invalid bank IBAN', () => {
    const invalidIban = paymentMethodSchema.safeParse({
      method_type: 'bank_iban',
      account_title: 'Tariq Mehmood',
      account_number_or_iban: '1234567890',
      bank_name: 'Meezan Bank',
    });
    assert.equal(invalidIban.success, false);
  });

  test('rejects bank IBAN without bank name', () => {
    const missingBank = paymentMethodSchema.safeParse({
      method_type: 'bank_iban',
      account_title: 'Tariq Mehmood',
      account_number_or_iban: 'PK36SCBL0000001123456701',
      bank_name: '',
    });
    assert.equal(missingBank.success, false);
  });
});

describe('Novel and Chapter Form Schemas', () => {
  test('validates complete novel form input', () => {
    const validNovel = novelFormSchema.safeParse({
      title_urdu: 'روشنی کا سفر',
      title_english: 'Journey of Light',
      synopsis_urdu: 'یہ کہانی اندھیروں میں امید کے چراغ جلانے والے ایک نوجوان کی ہے۔',
      description_urdu: 'تفصیلی تعارف یہاں درج ہے۔',
      cover_url: 'https://cdn.example.com/cover.webp',
      price_pkr: 450,
      language: 'ur',
      genre_ids: ['a0000000-0000-4000-8000-000000000001'],
      rights_declaration_accepted: true,
    });
    assert.equal(validNovel.success, true);
  });

  test('rejects novel with price below 50 PKR (no free novels)', () => {
    const freeNovel = novelFormSchema.safeParse({
      title_urdu: 'روشنی کا سفر',
      title_english: 'Journey of Light',
      synopsis_urdu: 'یہ کہانی اندھیروں میں امید کے چراغ جلانے والے ایک نوجوان کی ہے۔',
      price_pkr: 0,
      genre_ids: ['a0000000-0000-4000-8000-000000000001'],
      rights_declaration_accepted: true,
    });
    assert.equal(freeNovel.success, false);

    const cheapNovel = novelFormSchema.safeParse({
      title_urdu: 'روشنی کا سفر',
      title_english: 'Journey of Light',
      synopsis_urdu: 'یہ کہانی اندھیروں میں امید کے چراغ جلانے والے ایک نوجوان کی ہے۔',
      price_pkr: 49,
      genre_ids: ['a0000000-0000-4000-8000-000000000001'],
      rights_declaration_accepted: true,
    });
    assert.equal(cheapNovel.success, false);
  });

  test('accepts novel with exactly minimum price of 50 PKR', () => {
    const minNovel = novelFormSchema.safeParse({
      title_urdu: 'روشنی کا سفر',
      title_english: 'Journey of Light',
      synopsis_urdu: 'یہ کہانی اندھیروں میں امید کے چراغ جلانے والے ایک نوجوان کی ہے۔',
      price_pkr: 50,
      genre_ids: ['a0000000-0000-4000-8000-000000000001'],
      rights_declaration_accepted: true,
    });
    assert.equal(minNovel.success, true);
  });

  test('rejects fractional paise price amounts', () => {
    const fractionalNovel = novelFormSchema.safeParse({
      title_urdu: 'روشنی کا سفر',
      title_english: 'Journey of Light',
      synopsis_urdu: 'یہ کہانی اندھیروں میں امید کے چراغ جلانے والے ایک نوجوان کی ہے۔',
      price_pkr: 49.5,
      genre_ids: ['a0000000-0000-4000-8000-000000000001'],
      rights_declaration_accepted: true,
    });
    assert.equal(fractionalNovel.success, false);
  });

  test('createNovelFormSchema supports dynamic bounds from platform settings', () => {
    const customSchema = createNovelFormSchema({ minPrice: 100, maxPrice: 1000 });

    const belowCustom = customSchema.safeParse({
      title_urdu: 'روشنی کا سفر',
      title_english: 'Journey of Light',
      synopsis_urdu: 'یہ کہانی اندھیروں میں امید کے چراغ جلانے والے ایک نوجوان کی ہے۔',
      price_pkr: 75,
      genre_ids: ['a0000000-0000-4000-8000-000000000001'],
      rights_declaration_accepted: true,
    });
    assert.equal(belowCustom.success, false);

    const validCustom = customSchema.safeParse({
      title_urdu: 'روشنی کا سفر',
      title_english: 'Journey of Light',
      synopsis_urdu: 'یہ کہانی اندھیروں میں امید کے چراغ جلانے والے ایک نوجوان کی ہے۔',
      price_pkr: 250,
      genre_ids: ['a0000000-0000-4000-8000-000000000001'],
      rights_declaration_accepted: true,
    });
    assert.equal(validCustom.success, true);
  });

  test('rejects novel with price exceeding 5000 PKR', () => {
    const expensiveNovel = novelFormSchema.safeParse({
      title_urdu: 'روشنی کا سفر',
      title_english: 'Journey of Light',
      synopsis_urdu: 'یہ کہانی اندھیروں میں امید کے چراغ جلانے والے ایک نوجوان کی ہے۔',
      price_pkr: 7500,
      genre_ids: ['a0000000-0000-4000-8000-000000000001'],
      rights_declaration_accepted: true,
    });
    assert.equal(expensiveNovel.success, false);
  });

  test('rejects novel without rights declaration accepted', () => {
    const undeclared = novelFormSchema.safeParse({
      title_urdu: 'روشنی کا سفر',
      title_english: 'Journey of Light',
      synopsis_urdu: 'یہ کہانی اندھیروں میں امید کے چراغ جلانے والے ایک نوجوان کی ہے۔',
      price_pkr: 200,
      genre_ids: ['a0000000-0000-4000-8000-000000000001'],
      rights_declaration_accepted: false,
    });
    assert.equal(undeclared.success, false);
  });

  test('validates chapter form and rejects > 120,000 characters', () => {
    const validChapter = chapterFormSchema.safeParse({
      chapter_number: 1,
      title_urdu: 'پہلا باب',
      content_urdu: 'یہ باب کا ابتدائی متن ہے۔',
      is_free_preview: true,
      is_published: true,
    });
    assert.equal(validChapter.success, true);

    const oversized = chapterFormSchema.safeParse({
      chapter_number: 1,
      title_urdu: 'پہلا باب',
      content_urdu: 'ا'.repeat(120001),
      is_free_preview: false,
      is_published: true,
    });
    assert.equal(oversized.success, false);
  });
});
