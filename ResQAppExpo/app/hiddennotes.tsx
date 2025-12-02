import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Alert,
  ActivityIndicator,
  TouchableOpacity,
  Keyboard,
  FlatList,
} from 'react-native';
import {
  addDoc,
  collection,
  serverTimestamp,
  onSnapshot,
  query,
  orderBy,
  deleteDoc,
  doc,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../config/firebase';

const HiddenNotes = () => {
  const [note, setNote] = useState('');
  const [loadingSave, setLoadingSave] = useState(false);
  const [loadingNotes, setLoadingNotes] = useState(true);
  const [notes, setNotes] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // 🔄 Live Firestore subscription to hidden_notes
  useEffect(() => {
    // ✅ Only order by createdAt, avoid index requirement
    const qRef = query(
      collection(db, 'hidden_notes'),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(
      qRef,
      snapshot => {
        const list = snapshot.docs.map(docSnap => ({
          id: docSnap.id,
          ...docSnap.data(),
        }));
        setNotes(list);
        setLoadingNotes(false);
      },
      error => {
        console.error('Error loading hidden notes: ', error);
        setLoadingNotes(false);
        Alert.alert('Error', 'Failed to load notes.');
      }
    );

    return () => unsubscribe();
  }, []);

  const handleSave = async () => {
    const trimmedNote = note.trim();

    if (!trimmedNote) {
      Alert.alert('Empty Note', 'Please enter a note before saving.');
      return;
    }

    try {
      setLoadingSave(true);
      Keyboard.dismiss();

      await addDoc(collection(db, 'hidden_notes'), {
        content: trimmedNote,
        createdAt: serverTimestamp(),
        pinned: false, // default
      });

      setNote('');
      Alert.alert('Saved', 'Your hidden note has been stored securely.');
    } catch (error: any) {
      console.error('Error saving note:', error);
      Alert.alert('Error', error?.message || 'Failed to save note.');
    } finally {
      setLoadingSave(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'hidden_notes', id));
      if (expandedId === id) {
        setExpandedId(null);
      }
    } catch (error) {
      console.error('Error deleting note:', error);
      Alert.alert('Error', 'Failed to delete note.');
    }
  };

  const confirmDelete = (id: string) => {
    Alert.alert(
      'Delete note?',
      'This note will be removed permanently from your hidden area.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => handleDelete(id),
        },
      ]
    );
  };

  const toggleExpand = (id: string) => {
    setExpandedId(prev => (prev === id ? null : id));
  };

  const formatDate = (createdAt: any) => {
    try {
      let date: Date;

      if (!createdAt) {
        return '';
      }

      if (createdAt.toDate) {
        date = createdAt.toDate();
      } else if (createdAt.seconds) {
        date = new Date(createdAt.seconds * 1000);
      } else {
        date = new Date(createdAt);
      }

      return `${date.toLocaleDateString()} • ${date.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })}`;
    } catch {
      return '';
    }
  };

  const togglePin = async (id: string, currentPinned: boolean) => {
    try {
      await updateDoc(doc(db, 'hidden_notes', id), {
        pinned: !currentPinned,
      });
    } catch (error) {
      console.error('Error updating pin:', error);
      Alert.alert('Error', 'Failed to update pin status.');
    }
  };

  const handleNoteLongPress = (item: any) => {
    const isPinned = !!item.pinned;

    Alert.alert(
      'Note options',
      'Choose what you want to do with this note.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: isPinned ? 'Unpin from top' : 'Pin to top',
          onPress: () => togglePin(item.id, isPinned),
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => confirmDelete(item.id),
        },
      ]
    );
  };

  // 🔍 Filter by search text
  const filteredNotes = notes.filter(item =>
    item?.content?.toLowerCase().includes(search.toLowerCase())
  );

  // 📌 Sort pinned first (in JS, no index needed)
  const displayNotes = [...filteredNotes].sort((a, b) => {
    const aPinned = a.pinned ? 1 : 0;
    const bPinned = b.pinned ? 1 : 0;
    // higher pinned value first
    if (bPinned !== aPinned) return bPinned - aPinned;
    // if both same pinned state, keep Firestore order (already newest first)
    return 0;
  });

  const renderItem = ({ item }: { item: any }) => {
    const isExpanded = expandedId === item.id;
    const previewText = item.content || '';
    const isPinned = !!item.pinned;

    return (
      <TouchableOpacity
        activeOpacity={0.9}
        style={[
          styles.noteCard,
          isPinned && styles.pinnedNoteCard,
        ]}
        onPress={() => toggleExpand(item.id)}
        onLongPress={() => handleNoteLongPress(item)}
      >
        <View style={styles.noteHeaderRow}>
          <View style={{ flex: 1, marginRight: 8 }}>
            <Text style={styles.noteTitle} numberOfLines={1}>
              {previewText.split('\n')[0] || 'Untitled note'}
            </Text>
          </View>

          <View style={styles.noteMetaRight}>
            {isPinned && (
              <View style={styles.pinBadge}>
                <Text style={styles.pinBadgeText}>Pinned</Text>
              </View>
            )}
            {!!item.createdAt && (
              <Text style={styles.noteTime} numberOfLines={1}>
                {formatDate(item.createdAt)}
              </Text>
            )}
          </View>
        </View>

        <Text
          style={styles.noteContent}
          numberOfLines={isExpanded ? undefined : 3}
        >
          {previewText}
        </Text>
        <Text style={styles.noteFooterText}>
          {isExpanded
            ? 'Tap to collapse • Long-press for options'
            : 'Tap to expand • Long-press for options'}
        </Text>
      </TouchableOpacity>
    );
  };

  const charCount = note.length;
  const maxHint = charCount > 0 ? `${charCount} characters` : '';

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.heading}>Hidden Notes</Text>
        <Text style={styles.subheading}>
          Privately log incidents, thoughts or details that you don’t want mixed with normal notes.
        </Text>
      </View>

      {/* Input card */}
      <View style={styles.inputCard}>
        <View style={styles.inputHeaderRow}>
          <Text style={styles.inputLabel}>New Entry</Text>
          <Text style={styles.charCount}>{maxHint}</Text>
        </View>

        <TextInput
          style={styles.input}
          placeholder="Write what happened, how you feel, dates, names, or anything you want to remember later..."
          placeholderTextColor="#6b7280"
          value={note}
          onChangeText={setNote}
          multiline
          numberOfLines={5}
          textAlignVertical="top"
          returnKeyType="done"
        />

        <TouchableOpacity
          style={[
            styles.button,
            (loadingSave || !note.trim()) && styles.buttonDisabled,
          ]}
          onPress={handleSave}
          disabled={loadingSave || !note.trim()}
          activeOpacity={0.85}
        >
          {loadingSave ? (
            <ActivityIndicator color="#f9fafb" />
          ) : (
            <Text style={styles.buttonText}>Save Hidden Note</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Search + List */}
      <View style={styles.listContainer}>
        <View style={styles.searchRow}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search in your hidden notes..."
            placeholderTextColor="#6b7280"
            value={search}
            onChangeText={setSearch}
          />
        </View>

        {loadingNotes ? (
          <View style={styles.loadingNotesContainer}>
            <ActivityIndicator size="small" color="#e5e7eb" />
            <Text style={styles.loadingText}>Loading your notes…</Text>
          </View>
        ) : displayNotes.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No hidden notes yet</Text>
            <Text style={styles.emptyText}>
              Start by writing a private note above. Only you can see what is saved here.
            </Text>
          </View>
        ) : (
          <FlatList
            data={displayNotes}
            keyExtractor={item => item.id}
            renderItem={renderItem}
            contentContainerStyle={{ paddingBottom: 24 }}
            showsVerticalScrollIndicator={false}
          />
        )}
      </View>
    </View>
  );
};

export default HiddenNotes;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#020617', // deep slate
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 20,
  },
  header: {
    marginBottom: 12,
    marginTop: 8,
  },
  heading: {
    fontSize: 24,
    fontWeight: '700',
    color: '#f9fafb',
    marginBottom: 4,
    textAlign: 'left',
  },
  subheading: {
    fontSize: 13,
    color: '#9ca3af',
    lineHeight: 18,
  },
  inputCard: {
    backgroundColor: '#020617',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.4)',
    marginBottom: 14,
  },
  inputHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#e5e7eb',
  },
  charCount: {
    fontSize: 11,
    color: '#6b7280',
  },
  input: {
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.5)',
    borderRadius: 12,
    padding: 10,
    fontSize: 14,
    color: '#e5e7eb',
    minHeight: 100,
    maxHeight: 160,
    textAlignVertical: 'top',
    marginBottom: 10,
  },
  button: {
    backgroundColor: '#4f46e5',
    paddingVertical: 11,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    backgroundColor: '#4338ca',
    opacity: 0.7,
  },
  buttonText: {
    color: '#f9fafb',
    fontSize: 14,
    fontWeight: '600',
  },
  listContainer: {
    flex: 1,
  },
  searchRow: {
    marginBottom: 10,
  },
  searchInput: {
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.5)',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7,
    fontSize: 13,
    color: '#e5e7eb',
  },
  loadingNotesContainer: {
    marginTop: 20,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 6,
    fontSize: 12,
    color: '#9ca3af',
  },
  emptyState: {
    marginTop: 30,
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#e5e7eb',
    marginBottom: 6,
  },
  emptyText: {
    fontSize: 13,
    color: '#9ca3af',
    textAlign: 'center',
    lineHeight: 18,
  },
  noteCard: {
    backgroundColor: '#020617',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.35)',
    padding: 12,
    marginBottom: 10,
  },
  pinnedNoteCard: {
    borderColor: 'rgba(129, 140, 248, 0.9)',
  },
  noteHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  noteTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#e5e7eb',
  },
  noteMetaRight: {
    alignItems: 'flex-end',
    maxWidth: 140,
  },
  pinBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(129, 140, 248, 0.15)',
    marginBottom: 2,
  },
  pinBadgeText: {
    fontSize: 11,
    color: '#a5b4fc',
  },
  noteTime: {
    fontSize: 11,
    color: '#9ca3af',
  },
  noteContent: {
    fontSize: 13,
    color: '#d1d5db',
    lineHeight: 18,
    marginTop: 2,
    marginBottom: 6,
  },
  noteFooterText: {
    fontSize: 11,
    color: '#6b7280',
  },
});
