import streamlit as st
import pandas as pd
import plotly.express as px
import duckdb
import os

# Set page configuration
st.set_page_config(
    page_title="Junior Tennis Rankings Dashboard",
    page_icon="🎾",
    layout="wide"
)

conn = duckdb.connect('rankings.duckdb', read_only=True)


# Function to load data with caching
@st.cache_data
def load_players_data():
    return conn.execute("SELECT * FROM players").df()

@st.cache_data
def load_rankings_data():
    return conn.execute("SELECT * FROM rankings").df()

@st.cache_data
def load_player_rankings(player_id):
    query = f"""
    WITH allRankings AS (
        SELECT 
            week,
            r.playerId,
            points,
            p.county,
            p.year,
            rank() OVER (PARTITION BY week ORDER BY points DESC) as overallRanking,
            rank() OVER (PARTITION BY week, p.county ORDER BY points DESC) as countyRanking,
            rank() OVER (PARTITION BY week, p.year ORDER BY points DESC) as ageGroupRanking,
            rank() OVER (PARTITION BY week, p.county, p.year ORDER BY points DESC) as ageGroupCountyRanking
        FROM rankings r
        JOIN players p ON r.playerId = p.playerId
    )
    SELECT 
        r.week, 
        r.tournaments, 
        r.points, 
        ar.overallRanking,
        ar.countyRanking,
        ar.ageGroupRanking,
        ar.ageGroupCountyRanking
    FROM rankings r
    JOIN allRankings ar ON r.playerId = ar.playerId AND r.week = ar.week    
    WHERE r.playerId = {player_id}
    ORDER BY split(r.week, '-')[1]::Int
    """
    return conn.execute(query).df()

@st.cache_data
def load_surrounding_players(player_id, selected_week):
    query = f"""
    WITH allRankings AS (
        SELECT 
            week,
            r.playerId,
            p.playerName,
            points,
            p.county,
            p.year,
            rank() OVER (PARTITION BY week ORDER BY points DESC) as overall_ranking
        FROM rankings r
        JOIN players p ON r.playerId = p.playerId
    ),
    targetRankings AS (
        SELECT week, overall_ranking
        FROM allRankings
        WHERE playerId = {player_id}
    ),
    surroundingPlayers AS (
        SELECT 
            ar.week,
            ar.playerId,
            ar.playerName,
            ar.points,
            ar.overall_ranking,
            CASE 
                WHEN ar.playerId = {player_id} THEN 0  -- Target player
                ELSE ar.overall_ranking - tr.overall_ranking  -- Position relative to target
            END as position_from_target
        FROM allRankings ar
        JOIN targetRankings tr ON ar.week = tr.week
        -- Get players within 2 positions above and below
        WHERE ar.overall_ranking BETWEEN (tr.overall_ranking - 3) AND (tr.overall_ranking + 3)
    )
    SELECT 
        overall_ranking as "Rank",
        playerName as "Player",
        points as "Points"
    FROM surroundingPlayers
    WHERE week = ?
    ORDER BY 
        split(week, '-')[1]::Int,  -- First sort by week
        overall_ranking,  -- Then by ranking within each week
        playerName
    """
    return conn.execute(query, [selected_week]).df()

@st.cache_data
def get_unique_weeks():
    result = conn.execute("SELECT DISTINCT week FROM rankings ORDER BY split(week, '-')[1]::Int").fetchall()
    return [r[0] for r in result]

@st.cache_data
def get_counties():
    result = conn.execute("SELECT DISTINCT county FROM players ORDER BY county").fetchall()
    return [r[0] for r in result]

@st.cache_data
def get_years():
    result = conn.execute("SELECT DISTINCT year FROM players ORDER BY year").fetchall()
    return [r[0] for r in result]

@st.cache_data
def get_players_by_filter(county=None, year=None, name_search=None):
    max_week = '10-2025'
    
    conditions = []
    if county and county != "All":
        conditions.append(f"county = '{county}'")
    if year and year != "All":
        conditions.append(f"year = {year}")
    if name_search:
        conditions.append(f"playerName LIKE '%{name_search}%'")
    
    where_clause = " AND ".join(conditions)
    query = """
    SELECT playerName, players.playerId, year, county, row_number() OVER (ORDER BY points DESC) AS rank
    FROM players
    JOIN rankings ON rankings.playerId = players.playerId AND rankings.week = ?
    """
    if where_clause:
        query += f" WHERE {where_clause}"
    query += " ORDER BY rank"
    
    return conn.execute(query, [max_week]).df()

@st.cache_data
def get_player_count_by_county():
    query = """
    SELECT county, COUNT(*) as player_count 
    FROM players 
    WHERE county IS NOT NULL AND county != '' 
    GROUP BY county 
    ORDER BY player_count DESC
    """
    return conn.execute(query).df()

# App title and description
st.title("🎾 Junior Tennis Rankings Dashboard")

# Sidebar filters
st.sidebar.header("Filters")

# County filter
counties = ["All"] + get_counties()
selected_county = st.sidebar.selectbox("Select County", counties)

# Birth year filter
years = ["All"] + get_years()
selected_year = st.sidebar.selectbox("Select Birth Year", years)

# Player name search
player_search = st.sidebar.text_input("Search Player Name")

# Apply filters
filtered_players = get_players_by_filter(
    county=selected_county if selected_county != "All" else None,
    year=selected_year if selected_year != "All" else None,
    name_search=player_search if player_search else None
)

st.header("Player Directory")

# Show filtered players table with pagination
if not filtered_players.empty:
    st.write(f"Found {len(filtered_players)} players matching your criteria")
    st.dataframe(filtered_players, use_container_width=True, hide_index=True)
else:
    st.info("No players found matching your criteria")

# Player detail section
st.subheader("Player Details")

# Get player selection
if not filtered_players.empty:
    player_options = filtered_players['playerName'].tolist()
    selected_player_name = st.selectbox("Select a player for detailed view", player_options)
    
    # Get selected player details
    player_details = filtered_players[filtered_players['playerName'] == selected_player_name].iloc[0]
    player_id = player_details['playerId']
    
    # Display player info
    col1, col2 = st.columns(2)
    with col1:
        st.write(f"**Name:** {player_details['playerName']}")
        st.write(f"**Year:** {player_details['year']}")
    with col2:
        st.write(f"**County:** {player_details['county']}")
        st.write(f"**Player ID:** {player_details['playerId']}")
    
    # Get player rankings
    player_rankings = load_player_rankings(player_id)
    
    if not player_rankings.empty:
        st.subheader("Player Rankings History")
        
        # Create line chart for tournaments over time
        fig = px.bar(
            player_rankings, 
            x='week', 
            y='tournaments',
            labels={'week': 'Month', 'tournaments': 'Tournament Count'}
        )

        fig.add_scatter(
            x=player_rankings['week'],
            y=player_rankings['points'],
            name='Points',
            yaxis='y2',
            line=dict(color='red')
        )

        fig.update_layout(
            yaxis=dict(
                title='Tournament Count',
                range=[0, max(player_rankings['tournaments']) * 1.1]  # Add 10% padding at top
            ),
            yaxis2=dict(
                title='Points',
                overlaying='y',
                side='right',
                range=[0, max(player_rankings['points']) * 1.1]  # Add 10% padding at top
            )
        )


        st.plotly_chart(fig, use_container_width=True)
        st.dataframe(player_rankings, use_container_width=True, hide_index=True)
    else:
        st.info("No ranking data available for this player")

    # Show surrounding players
    st.subheader("Surrounding Players")
    weeks = get_unique_weeks()
    selected_week = st.selectbox("Select Week for Analysis", weeks, key="selected_week_player")
    surrounding_players = load_surrounding_players(player_id, selected_week)
    st.markdown("##### Overall")
    if not surrounding_players.empty:
        def highlight_target_player(row):
            return ['background-color: #FF0; color:#000' if row['Player'] == selected_player_name else '' for _ in row]

        styled_df = surrounding_players.style.apply(highlight_target_player, axis=1)
        st.dataframe(styled_df, use_container_width=True, hide_index=True)
    else:
        st.info("No surrounding players found for this player")
