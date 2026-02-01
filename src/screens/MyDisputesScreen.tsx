// src/screens/MyDisputesScreen.tsx
import React, { useState, useEffect, useContext } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  FlatList,
  TouchableOpacity,
  Image,
  RefreshControl,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import DisputeService, { Dispute } from '../services/DisputeService';
import { AuthContext } from '../contexts/AuthContext';

const Colors = {
  primary: '#F5C542',
  secondary: '#2E86AB',
  success: '#46A758',
  warning: '#F59E0B',
  danger: '#EF4444',
  background: '#F8F9FA',
  text: '#212529',
  white: '#FFFFFF',
  border: '#E9ECEF',
};

type FilterType = 'all' | 'open' | 'investigating' | 'resolved';

export default function MyDisputesScreen() {
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [filteredDisputes, setFilteredDisputes] = useState<Dispute[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterType>('all');
  const { user } = useContext(AuthContext);
  const navigation = useNavigation();

  useEffect(() => {
    loadDisputes();
  }, []);

  useEffect(() => {
    applyFilter();
  }, [filter, disputes]);

  const loadDisputes = async () => {
    if (!user) return;

    try {
      const userDisputes = await DisputeService.getDisputesByUser(user.id);
      setDisputes(userDisputes);
    } catch (error) {
      console.error('Error loading disputes:', error);
      Alert.alert('Error', 'Failed to load disputes');
    } finally {
      setLoading(false);
    }
  };

  const applyFilter = () => {
    if (filter === 'all') {
      setFilteredDisputes(disputes);
    } else {
      setFilteredDisputes(disputes.filter(d => d.status === filter));
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadDisputes();
    setRefreshing(false);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const handleDisputePress = (dispute: Dispute) => {
    (navigation as any).navigate('DisputeDetails', { disputeId: dispute.id });
  };

  const renderFilterButton = (filterType: FilterType, label: string) => (
    <TouchableOpacity
      key={filterType}
      style={[styles.filterButton, filter === filterType && styles.filterButtonActive]}
      onPress={() => setFilter(filterType)}
    >
      <Text style={[styles.filterButtonText, filter === filterType && styles.filterButtonTextActive]}>
        {label}
      </Text>
    </TouchableOpacity>
  );

  const renderDisputeCard = ({ item }: { item: Dispute }) => {
    const isReporter = item.reporterId === user?.id;

    return (
      <TouchableOpacity 
        style={styles.disputeCard}
        onPress={() => handleDisputePress(item)}
      >
        <View style={styles.cardHeader}>
          <View style={styles.flex1}>
            <Text style={styles.itemTitle}>{item.itemTitle}</Text>
            <Text style={styles.disputeType}>
              {DisputeService.getDisputeTypeLabel(item.type)}
            </Text>
          </View>
          <View style={[
            styles.statusBadge,
            { backgroundColor: DisputeService.getDisputeStatusColor(item.status) + '20' }
          ]}>
            <Text style={[
              styles.statusText,
              { color: DisputeService.getDisputeStatusColor(item.status) }
            ]}>
              {item.status.toUpperCase()}
            </Text>
          </View>
        </View>

        <View style={styles.roleIndicator}>
          <Ionicons 
            name={isReporter ? 'flag' : 'shield-checkmark'} 
            size={16} 
            color={isReporter ? Colors.danger : Colors.secondary} 
          />
          <Text style={styles.roleText}>
            {isReporter ? 'You reported this issue' : 'Reported against you'}
          </Text>
        </View>

        <View style={styles.disputeInfo}>
          <View style={styles.infoRow}>
            <Ionicons name="person-outline" size={16} color={Colors.text} />
            <Text style={styles.infoText}>
              {isReporter ? `Against: ${item.accusedName}` : `By: ${item.reporterName}`}
            </Text>
          </View>

          <View style={styles.infoRow}>
            <Ionicons name="calendar-outline" size={16} color={Colors.text} />
            <Text style={styles.infoText}>
              Submitted: {formatDate(item.createdAt)}
            </Text>
          </View>

          {item.estimatedCost && (
            <View style={styles.infoRow}>
              <Ionicons name="cash-outline" size={16} color={Colors.text} />
              <Text style={styles.infoText}>
                Estimated Cost: ${item.estimatedCost.toFixed(2)}
              </Text>
            </View>
          )}
        </View>

        <Text style={styles.description} numberOfLines={2}>
          {item.description}
        </Text>

        {item.damagePhotos.length > 0 && (
          <View style={styles.photoPreview}>
            <Ionicons name="images" size={16} color={Colors.secondary} />
            <Text style={styles.photoCount}>
              {item.damagePhotos.length} photo{item.damagePhotos.length !== 1 ? 's' : ''} attached
            </Text>
          </View>
        )}

        <View style={styles.cardFooter}>
          <Text style={styles.viewDetailsText}>Tap to view details</Text>
          <Ionicons name="chevron-forward" size={20} color={Colors.text} />
        </View>
      </TouchableOpacity>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Ionicons name="alert-circle-outline" size={64} color={Colors.text} />
      <Text style={styles.emptyTitle}>No Disputes</Text>
      <Text style={styles.emptySubtitle}>
        {filter === 'all' 
          ? "You don't have any disputes"
          : `No ${filter} disputes`}
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Disputes</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.filterContainer}>
        {renderFilterButton('all', 'All')}
        {renderFilterButton('open', 'Open')}
        {renderFilterButton('investigating', 'Investigating')}
        {renderFilterButton('resolved', 'Resolved')}
      </View>

      <View style={styles.statsBar}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{disputes.length}</Text>
          <Text style={styles.statLabel}>Total</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: Colors.danger }]}>
            {disputes.filter(d => d.status === 'open').length}
          </Text>
          <Text style={styles.statLabel}>Open</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: Colors.warning }]}>
            {disputes.filter(d => d.status === 'investigating').length}
          </Text>
          <Text style={styles.statLabel}>Investigating</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: Colors.success }]}>
            {disputes.filter(d => d.status === 'resolved').length}
          </Text>
          <Text style={styles.statLabel}>Resolved</Text>
        </View>
      </View>

      <FlatList
        data={filteredDisputes}
        renderItem={renderDisputeCard}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={!loading ? renderEmptyState : null}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.text,
  },
  filterContainer: {
    flexDirection: 'row',
    padding: 16,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 8,
  },
  filterButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: Colors.background,
    alignItems: 'center',
  },
  filterButtonActive: {
    backgroundColor: Colors.secondary,
  },
  filterButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.text,
  },
  filterButtonTextActive: {
    color: Colors.white,
    fontWeight: '600',
  },
  statsBar: {
    flexDirection: 'row',
    backgroundColor: Colors.white,
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: Colors.text,
  },
  statLabel: {
    fontSize: 12,
    color: Colors.text,
    opacity: 0.7,
    marginTop: 4,
  },
  statDivider: {
    width: 1,
    backgroundColor: Colors.border,
    marginHorizontal: 8,
  },
  listContent: {
    padding: 16,
  },
  disputeCard: {
    backgroundColor: Colors.white,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  flex1: {
    flex: 1,
  },
  itemTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 4,
  },
  disputeType: {
    fontSize: 14,
    color: Colors.secondary,
    fontWeight: '600',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  roleIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    alignSelf: 'flex-start',
    marginBottom: 12,
    gap: 6,
  },
  roleText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.text,
  },
  disputeInfo: {
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  infoText: {
    fontSize: 14,
    color: Colors.text,
  },
  description: {
    fontSize: 14,
    color: Colors.text,
    lineHeight: 20,
    marginBottom: 12,
  },
  photoPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: Colors.secondary + '10',
    borderRadius: 8,
    marginBottom: 12,
    gap: 8,
  },
  photoCount: {
    fontSize: 14,
    color: Colors.secondary,
    fontWeight: '600',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  viewDetailsText: {
    fontSize: 14,
    color: Colors.secondary,
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.text,
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 16,
    color: Colors.text,
    opacity: 0.7,
    textAlign: 'center',
  },
});