import { runAllMigrations } from './migrateRentals';

// Run migrations immediately
console.log('🚀 Starting manual migration...');
runAllMigrations()
  .then((result) => {
    console.log('✅ Migration completed!', result);
  })
  .catch((error) => {
    console.error('❌ Migration failed:', error);
  });