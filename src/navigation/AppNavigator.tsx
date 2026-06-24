import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { AppStackParamList, AppTabParamList } from './types';
import { colors } from '../theme/colors';
import HomeScreen from '../screens/app/HomeScreen';
import JournalScreen from '../screens/app/JournalScreen';
import MeScreen from '../screens/app/MeScreen';
import WeightScreen from '../screens/app/WeightScreen';
import SettingsScreen from '../screens/app/SettingsScreen';

// ── Tab navigator (unchanged — Home, Journal, Me) ─────────────────────────────
const Tab = createBottomTabNavigator<AppTabParamList>();

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

const TAB_ICONS: Record<string, { active: IoniconsName; inactive: IoniconsName }> = {
  Journal: { active: 'book',          inactive: 'book-outline' },
  Me:      { active: 'person-circle', inactive: 'person-circle-outline' },
};

function AppTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.bgCard,
          borderTopColor: colors.bgSurface,
          borderTopWidth: 1,
          paddingBottom: 8,
          paddingTop: 6,
          height: 60,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '500',
        },
        tabBarIcon: ({ color, focused }) => {
          const icons = TAB_ICONS[route.name];
          if (!icons) return null;
          return (
            <Ionicons
              name={focused ? icons.active : icons.inactive}
              size={22}
              color={color}
            />
          );
        },
      })}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{ tabBarLabel: 'Home', tabBarStyle: { display: 'none' } }}
      />
      <Tab.Screen name="Journal" component={JournalScreen} options={{ tabBarLabel: 'Journal' }} />
      <Tab.Screen name="Me"      component={MeScreen}      options={{ tabBarLabel: 'Me' }} />
    </Tab.Navigator>
  );
}

// ── App stack — tabs at root, full-screen push screens on top ─────────────────
// Think of this like a stack of cards: AppTabs is always the bottom card.
// When navigation.navigate('Weight') is called from anywhere in the app, a new
// full-screen card slides on top. Back (hardware or swipe) pops it off.
const Stack = createNativeStackNavigator<AppStackParamList>();

export default function AppNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Tabs"     component={AppTabs} />
      <Stack.Screen name="Weight"   component={WeightScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
    </Stack.Navigator>
  );
}
