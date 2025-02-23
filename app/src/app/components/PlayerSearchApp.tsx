'use client'

import React, { useState, useEffect } from 'react';
import { ChangeEvent } from 'react';  // Add this import at the top
import Papa from 'papaparse';
import _ from 'lodash';

// interface RankingData {
//     countyRank: number;
//     countySize: number;
//   }
  
// interface YearRankingData {
// yearRank: number;
// yearSize: number;
// }

interface Player {
'Player ID': string;
'Player Name': string;
'County'?: string;
'Year'?: string | number;
'Ranking Points'?: number;
overallRank?: number;
}

// interface CountyRankings {
// [playerId: string]: RankingData;
// }

// interface YearRankings {
// [playerId: string]: YearRankingData;
// }

interface CountyRanking {
countyRank?: number;
countySize?: number;
}

interface CountyRankingsMap {
[playerId: string]: CountyRanking;
}  

interface YearRanking {
    yearRank?: number;
    yearSize?: number;
  }
  
interface YearRankingsMap {
[playerId: string]: YearRanking;
}

const PlayerSearchApp = () => {
    const [searchTerm, setSearchTerm] = useState('');
    const [allPlayers, setAllPlayers] = useState<Player[]>([]);
    const [filteredPlayers, setFilteredPlayers] = useState<Player[]>([]);
    const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
    const [countyRanks, setCountyRanks] = useState<CountyRankingsMap>({});
    const [yearRanks, setYearRanks] = useState<YearRankingsMap>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
  
  const processPlayerData = (players: Player[]) => {
    try {
      // Filter out invalid players
      const validPlayers = players.filter(player => 
        player && player['Player ID'] && player['Player Name']
      );
      
      // Sort all players by ranking points to get overall ranks
      const playersSortedByPoints = [...validPlayers]
        .sort((a, b) => {
          const pointsA = a['Ranking Points'] || 0;
          const pointsB = b['Ranking Points'] || 0;
          return pointsB - pointsA;
        });
        
      // Add overall rank to each player
      const playersWithRanks = playersSortedByPoints.map((player, index) => ({
        ...player,
        overallRank: index + 1
      }));
      
      // Group players by county and calculate county ranks
      const playersByCounty = _.groupBy(
        playersWithRanks.filter(p => p.County), 
        'County'
      );
            
      const countyRankings: CountyRankingsMap = {};
      
      Object.entries(playersByCounty).forEach(([county, countyPlayers]) => {
        if (!county) return;
        
        const sortedCountyPlayers = [...countyPlayers]
          .sort((a, b) => {
            const pointsA = a['Ranking Points'] || 0;
            const pointsB = b['Ranking Points'] || 0;
            return pointsB - pointsA;
          });
        
        sortedCountyPlayers.forEach((player, index) => {
          const playerId = player['Player ID'];
          if (playerId) {
            if (!countyRankings[playerId]) countyRankings[playerId] = {};
            countyRankings[playerId].countyRank = index + 1;
            countyRankings[playerId].countySize = sortedCountyPlayers.length;
          }
        });
      });
      
      // Group players by birth year and calculate year ranks
      const playersByYear = _.groupBy(
        playersWithRanks.filter(p => p.Year), 
        'Year'
      );
            
      const yearRankings: YearRankingsMap = {};
      
      Object.entries(playersByYear).forEach(([year, yearPlayers]) => {
        if (!year) return;
        
        const sortedYearPlayers = [...yearPlayers]
          .sort((a, b) => {
            const pointsA = a['Ranking Points'] || 0;
            const pointsB = b['Ranking Points'] || 0;
            return pointsB - pointsA;
          });
        
        sortedYearPlayers.forEach((player, index) => {
          const playerId = player['Player ID'];
          if (playerId) {
            if (!yearRankings[playerId]) yearRankings[playerId] = {};
            yearRankings[playerId].yearRank = index + 1;
            yearRankings[playerId].yearSize = sortedYearPlayers.length;
          }
        });
      });
      
      setAllPlayers(playersWithRanks);
      setFilteredPlayers(playersWithRanks);
      setCountyRanks(countyRankings);
      setYearRanks(yearRankings);
      setLoading(false);
    } catch (err: unknown) {  // explicitly type as unknown
      console.error("Error processing player data:", err);
      setError(`Error processing data: ${String(err)}`);
      setLoading(false);
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch('/api/csv');
        const { data: csvContent } = await response.json();
        
        const results = Papa.parse(csvContent, {
          header: true,
          skipEmptyLines: true
        });
        
        processPlayerData(results.data as Player[]);
     } catch (err: unknown) {  // explicitly type as unknown
        console.error("Error processing player data:", err);
        setError(`Error processing data: ${String(err)}`);
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  useEffect(() => {
    if (searchTerm.trim() === '') {
      setFilteredPlayers(allPlayers);
    } else {
      const lowercaseSearch = searchTerm.toLowerCase();
      const filtered = allPlayers.filter(player => 
        (player['Player Name'] && player['Player Name'].toLowerCase().includes(lowercaseSearch)) ||
        (player['County'] && player['County'].toLowerCase().includes(lowercaseSearch))
      );
      setFilteredPlayers(filtered);
    }
  }, [searchTerm, allPlayers]);

  const handleSearch = (e: ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
  };

  const handlePlayerSelect = (player: Player) => {
    setSelectedPlayer(player);
  };

  const findSimilarPlayers = (): Player[] => {
    if (!selectedPlayer || !selectedPlayer['Player ID']) return [];
    
    const sameCountyAndYear = allPlayers.filter(player => 
      player['County'] === selectedPlayer['County'] &&
      player['Year'] === selectedPlayer['Year'] &&
      player['Player ID'] !== selectedPlayer['Player ID']
    );
    
    const targetPoints = selectedPlayer['Ranking Points'] || 0;
    const lowerBound = targetPoints * 0.7;
    const upperBound = targetPoints * 1.3;
    
    const similarPoints = allPlayers.filter(player => {
      const playerPoints = player['Ranking Points'] || 0;  // Handle undefined case
      return playerPoints >= lowerBound &&
             playerPoints <= upperBound &&
             player['Player ID'] !== selectedPlayer['Player ID'];
    });
    
    const combined = _.uniqBy([...sameCountyAndYear, ...similarPoints], 'Player ID');
    return combined
      .sort((a, b) => {
        const pointsA = a['Ranking Points'] || 0;
        const pointsB = b['Ranking Points'] || 0;
        return Math.abs(pointsA - targetPoints) - Math.abs(pointsB - targetPoints);
      })
      .slice(0, 5);
  };

  const renderPlayerDetails = () => {
    if (!selectedPlayer) return null;
    
    const playerId = selectedPlayer['Player ID'];
    const countyRanking = countyRanks[playerId] || {};
    const yearRanking = yearRanks[playerId] || {};
    
    const similarPlayers = findSimilarPlayers();
    
    return (
      <div className="mt-6 bg-background p-6 rounded-lg shadow-lg border border-gray-200 dark:border-gray-800">
        <h2 className="text-2xl font-bold mb-4 text-blue-800 dark:text-blue-400">
          {selectedPlayer['Player Name']}
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h3 className="text-xl font-semibold mb-3 text-foreground">Player Information</h3>
            <table className="w-full">
              <tbody>
                <tr>
                  <td className="py-2 font-medium text-foreground">Player ID:</td>
                  <td className="text-foreground">{playerId}</td>
                </tr>
                <tr>
                  <td className="py-2 font-medium text-foreground">Birth Year:</td>
                  <td className="text-foreground">{selectedPlayer['Year'] || 'Not specified'}</td>
                </tr>
                <tr>
                  <td className="py-2 font-medium text-foreground">County:</td>
                  <td className="text-foreground">{selectedPlayer['County'] || 'Not specified'}</td>
                </tr>
                <tr>
                  <td className="py-2 font-medium text-foreground">Ranking Points:</td>
                  <td className="font-bold text-blue-700 dark:text-blue-400">{selectedPlayer['Ranking Points']}</td>
                </tr>
              </tbody>
            </table>
          </div>
          
          <div>
            <h3 className="text-xl font-semibold mb-3 text-foreground">Ranking Information</h3>
            <table className="w-full">
              <tbody>
                <tr>
                  <td className="py-2 font-medium text-foreground">Overall Rank:</td>
                  <td className="font-bold text-foreground">{selectedPlayer.overallRank} of {allPlayers.length}</td>
                </tr>
                {countyRanking.countyRank && (
                  <tr>
                    <td className="py-2 font-medium text-foreground">County Rank:</td>
                    <td className="font-bold text-foreground">
                      {countyRanking.countyRank} of {countyRanking.countySize} in {selectedPlayer['County']}
                    </td>
                  </tr>
                )}
                {yearRanking.yearRank && (
                  <tr>
                    <td className="py-2 font-medium text-foreground">Birth Year Rank:</td>
                    <td className="font-bold text-foreground">
                      {yearRanking.yearRank} of {yearRanking.yearSize} born in {selectedPlayer['Year']}
                    </td>
                  </tr>
                )}
               <tr>
                <td className="py-2 font-medium text-foreground">Top 100:</td>
                <td className={
                    (selectedPlayer.overallRank ?? Infinity) <= 100 
                    ? "font-bold text-green-600 dark:text-green-400" 
                    : "text-red-600 dark:text-red-400"
                }>
                    {(selectedPlayer.overallRank ?? Infinity) <= 100 ? 'Yes' : 'No'}
                </td>
                </tr>
            </tbody>
            </table>
          </div>
        </div>
        
        {similarPlayers.length > 0 && (
          <div className="mt-6">
            <h3 className="text-xl font-semibold mb-3 text-foreground">Similar Players</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead className="bg-gray-50 dark:bg-gray-800">
                  <tr>
                    <th className="py-2 px-4 border-b border-gray-200 dark:border-gray-700 text-left text-sm font-semibold text-foreground">
                      Player Name
                    </th>
                    <th className="py-2 px-4 border-b border-gray-200 dark:border-gray-700 text-left text-sm font-semibold text-foreground">
                      County
                    </th>
                    <th className="py-2 px-4 border-b border-gray-200 dark:border-gray-700 text-left text-sm font-semibold text-foreground">
                      Birth Year
                    </th>
                    <th className="py-2 px-4 border-b border-gray-200 dark:border-gray-700 text-left text-sm font-semibold text-foreground">
                      Ranking Points
                    </th>
                    <th className="py-2 px-4 border-b border-gray-200 dark:border-gray-700 text-left text-sm font-semibold text-foreground">
                      Overall Rank
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {similarPlayers.map((player, index) => (
                    <tr 
                      key={player['Player ID']} 
                      className={`cursor-pointer ${
                        index % 2 
                          ? "bg-gray-50 dark:bg-gray-800/50" 
                          : "bg-background"
                      } hover:bg-blue-50 dark:hover:bg-blue-900/20`}
                      onClick={() => handlePlayerSelect(player)}
                    >
                      <td className="py-2 px-4 border-b border-gray-200 dark:border-gray-700 text-sm font-medium text-foreground">
                        {player['Player Name']}
                      </td>
                      <td className="py-2 px-4 border-b border-gray-200 dark:border-gray-700 text-sm text-foreground">
                        {player['County'] || '-'}
                      </td>
                      <td className="py-2 px-4 border-b border-gray-200 dark:border-gray-700 text-sm text-foreground">
                        {player['Year'] || '-'}
                      </td>
                      <td className="py-2 px-4 border-b border-gray-200 dark:border-gray-700 text-sm text-foreground">
                        {player['Ranking Points']}
                      </td>
                      <td className="py-2 px-4 border-b border-gray-200 dark:border-gray-700 text-sm text-foreground">
                        {player.overallRank}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="bg-background p-6 rounded-lg shadow-lg border border-gray-200 dark:border-gray-800">
        <h1 className="text-2xl font-bold mb-6 text-center text-blue-800 dark:text-blue-400">
          LTA Player Search and Stats
        </h1>
        <div className="flex flex-col justify-center items-center h-64 bg-gray-100 dark:bg-gray-800 rounded-lg">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mb-4"></div>
          <p className="text-foreground">Loading player data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-background p-6 rounded-lg shadow-lg border border-gray-200 dark:border-gray-800">
        <h1 className="text-2xl font-bold mb-6 text-center text-blue-800 dark:text-blue-400">
          LTA Player Search and Stats
        </h1>
        <div className="p-4 bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg">
          <h2 className="text-lg font-bold mb-2">Error Loading Data</h2>
          <p>{error}</p>
          <p className="mt-4">
            Please try refreshing the page. If the problem persists, contact the administrator.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-background p-6 rounded-lg shadow-lg border border-gray-200 dark:border-gray-800">
      <h1 className="text-2xl font-bold mb-6 text-center text-blue-800 dark:text-blue-400">
        LTA Player Search and Stats
      </h1>
      
      <div className="mb-6">
        <div className="flex items-center mb-4">
          <input
            type="text"
            placeholder="Search by player name or county..."
            className="w-full p-3 border border-gray-300 dark:border-gray-700 rounded bg-background text-foreground focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            value={searchTerm}
            onChange={handleSearch}
          />
        </div>
        
        <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded">
          <p className="text-sm text-blue-700 dark:text-blue-400">
            Found {filteredPlayers.length} players. {searchTerm.trim() ? 'Click on a player to view detailed stats.' : 'Type to search for players.'}
          </p>
        </div>
      </div>
      
      {searchTerm.trim() !== '' && filteredPlayers.length > 0 && (
        <div className="overflow-x-auto max-h-96 overflow-y-auto mb-6">
          <table className="min-w-full">
            <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0">
              <tr>
                <th className="py-2 px-4 border-b border-gray-200 dark:border-gray-700 text-left text-sm font-semibold text-foreground">
                  Player Name
                </th>
                <th className="py-2 px-4 border-b border-gray-200 dark:border-gray-700 text-left text-sm font-semibold text-foreground">
                  County
                </th>
                <th className="py-2 px-4 border-b border-gray-200 dark:border-gray-700 text-left text-sm font-semibold text-foreground">
                  Birth Year
                </th>
                <th className="py-2 px-4 border-b border-gray-200 dark:border-gray-700 text-left text-sm font-semibold text-foreground">
                  Ranking Points
                </th>
                <th className="py-2 px-4 border-b border-gray-200 dark:border-gray-700 text-left text-sm font-semibold text-foreground">
                  Overall Rank
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredPlayers.slice(0, 100).map((player, index) => (
                <tr 
                  key={player['Player ID']} 
                  className={`cursor-pointer ${
                    index % 2 
                      ? "bg-gray-50 dark:bg-gray-800/50" 
                      : "bg-background"
                  } hover:bg-blue-50 dark:hover:bg-blue-900/20`}
                  onClick={() => handlePlayerSelect(player)}
                >
                  <td className="py-2 px-4 border-b border-gray-200 dark:border-gray-700 text-sm font-medium text-foreground">
                    {player['Player Name']}
                  </td>
                  <td className="py-2 px-4 border-b border-gray-200 dark:border-gray-700 text-sm text-foreground">
                    {player['County'] || '-'}
                  </td>
                  <td className="py-2 px-4 border-b border-gray-200 dark:border-gray-700 text-sm text-foreground">
                    {player['Year'] || '-'}
                  </td>
                  <td className="py-2 px-4 border-b border-gray-200 dark:border-gray-700 text-sm text-foreground">
                    {player['Ranking Points']}
                  </td>
                  <td className="py-2 px-4 border-b border-gray-200 dark:border-gray-700 text-sm text-foreground">
                    {player.overallRank}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredPlayers.length > 100 && (
            <div className="text-center p-2 bg-gray-100 dark:bg-gray-800 text-sm text-gray-600 dark:text-gray-400">
              Showing first 100 results. Please refine your search for more specific results.
            </div>
          )}
        </div>
      )}
      
      {searchTerm.trim() !== '' && filteredPlayers.length === 0 && (
        <div className="p-4 bg-gray-100 dark:bg-gray-800 text-center rounded-lg mb-6">
          <p className="text-gray-700 dark:text-gray-300">No players found matching your search. Try a different name or county.</p>
        </div>
      )}
      
      {renderPlayerDetails()}
      
      <div className="mt-8 text-center text-sm text-gray-500 dark:text-gray-400">
        <p>Data loaded successfully: {allPlayers.length} players</p>
      </div>
    </div>
  );
};

export default PlayerSearchApp;