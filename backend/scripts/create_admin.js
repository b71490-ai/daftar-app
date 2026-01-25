#!/usr/bin/env node
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function parseArgs() {
  const args = {};
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const val = process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[++i] : true;
      args[key] = val;
    }
  }
  return args;
}

async function main() {
  const args = parseArgs();
  const email = args.email || args.e;
  const name = args.name || args.n || 'Administrator';

  if (!email) {
    console.error('Usage: node create_admin.js --email admin@example.com [--name "Admin Name"]');
    process.exit(1);
  }

  try {
    const user = await prisma.user.upsert({
      where: { email },
      update: { name, role: 'ADMIN' },
      create: { email, name, role: 'ADMIN' },
    });

    console.log('Admin user created/updated successfully:');
    console.log(`- id: ${user.id}`);
    console.log(`- email: ${user.email}`);
    console.log(`- name: ${user.name}`);
    console.log('Use the id as a legacy bearer token for local admin access:');
    console.log(`  Authorization: Bearer ${user.id}`);
  } catch (err) {
    console.error('Failed to create admin user:', err.message || err);
    process.exitCode = 2;
  } finally {
    await prisma.$disconnect();
  }
}

main();
