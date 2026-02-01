import { collection, getDocs, updateDoc, doc } from 'firebase/firestore';
import { db } from '../config/firebase';

/**
 * Migrate rentals collection: itemTitle → itemName
 */
export const migrateRentalsItemTitle = async () => {
  console.log('🔄 Starting migration: rentals itemTitle → itemName');
  
  try {
    const rentalsRef = collection(db, 'rentals');
    const snapshot = await getDocs(rentalsRef);
    
    console.log(`📊 Found ${snapshot.size} rentals to check`);
    
    let updatedCount = 0;
    let skippedCount = 0;
    
    for (const rentalDoc of snapshot.docs) {
      const data = rentalDoc.data();
      
      // If has itemTitle but no itemName, migrate it
      if (data.itemTitle && !data.itemName) {
        await updateDoc(doc(db, 'rentals', rentalDoc.id), {
          itemName: data.itemTitle,
        });
        
        console.log(`✅ Updated rental ${rentalDoc.id}: "${data.itemTitle}"`);
        updatedCount++;
      } else if (data.itemName) {
        skippedCount++;
      }
    }
    
    console.log(`✅ Migration complete: ${updatedCount} updated, ${skippedCount} already migrated`);
    
    return { 
      success: true, 
      updated: updatedCount,
      skipped: skippedCount,
      total: snapshot.size
    };
  } catch (error) {
    console.error('❌ Migration failed:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error',
      updated: 0,
      skipped: 0
    };
  }
};

/**
 * Migrate disputes collection: itemTitle → itemName
 */
export const migrateDisputesItemTitle = async () => {
  console.log('🔄 Starting migration: disputes itemTitle → itemName');
  
  try {
    const disputesRef = collection(db, 'disputes');
    const snapshot = await getDocs(disputesRef);
    
    console.log(`📊 Found ${snapshot.size} disputes to check`);
    
    let updatedCount = 0;
    let skippedCount = 0;
    
    for (const disputeDoc of snapshot.docs) {
      const data = disputeDoc.data();
      
      // If has itemTitle but no itemName, migrate it
      if (data.itemTitle && !data.itemName) {
        await updateDoc(doc(db, 'disputes', disputeDoc.id), {
          itemName: data.itemTitle,
        });
        
        console.log(`✅ Updated dispute ${disputeDoc.id}: "${data.itemTitle}"`);
        updatedCount++;
      } else if (data.itemName) {
        skippedCount++;
      }
    }
    
    console.log(`✅ Migration complete: ${updatedCount} updated, ${skippedCount} already migrated`);
    
    return { 
      success: true, 
      updated: updatedCount,
      skipped: skippedCount,
      total: snapshot.size
    };
  } catch (error) {
    console.error('❌ Migration failed:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error',
      updated: 0,
      skipped: 0
    };
  }
};

/**
 * Run all database migrations
 */
export const runAllMigrations = async () => {
  console.log('🚀 Starting all database migrations...');
  console.log('⏰ This may take a few moments...\n');
  
  const startTime = Date.now();
  
  // Run rentals migration
  const rentalsResult = await migrateRentalsItemTitle();
  
  // Run disputes migration
  const disputesResult = await migrateDisputesItemTitle();
  
  const endTime = Date.now();
  const duration = ((endTime - startTime) / 1000).toFixed(2);
  
  console.log('\n📊 MIGRATION SUMMARY:');
  console.log('═══════════════════════════════════════');
  console.log(`Rentals:  ${rentalsResult.updated} updated, ${rentalsResult.skipped} skipped`);
  console.log(`Disputes: ${disputesResult.updated} updated, ${disputesResult.skipped} skipped`);
  console.log(`Duration: ${duration} seconds`);
  console.log('═══════════════════════════════════════\n');
  
  const overallSuccess = rentalsResult.success && disputesResult.success;
  
  if (overallSuccess) {
    console.log('✅ All migrations completed successfully!');
  } else {
    console.log('⚠️ Some migrations failed. Check logs above.');
  }
  
  return {
    success: overallSuccess,
    rentals: rentalsResult,
    disputes: disputesResult,
    duration: `${duration}s`
  };
};