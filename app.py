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
            rank() OVER (PARTITION BY week, p.year ORDER BY points DESC) as ageGroupRanking
        FROM rankings r
        JOIN players p ON r.playerId = p.playerId
    )
    SELECT 
        r.week, 
        r.tournaments, 
        r.points, 
        ar.overallRanking,
        ar.countyRanking,
        ar.ageGroupRanking
    FROM rankings r
    JOIN allRankings ar ON r.playerId = ar.playerId AND r.week = ar.week    
    WHERE r.playerId = {player_id}
    ORDER BY split(r.week, '-')[1]::Int
    """
    return conn.execute(query).df()

@st.cache_data
def get_unique_weeks():
    result = conn.execute("SELECT DISTINCT week FROM rankings ORDER BY week").fetchall()
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
    
    conditions = []
    if county and county != "All":
        conditions.append(f"county = '{county}'")
    if year and year != "All":
        conditions.append(f"year = {year}")
    if name_search:
        conditions.append(f"playerName LIKE '%{name_search}%'")
    
    where_clause = " AND ".join(conditions)
    query = "SELECT * FROM players"
    if where_clause:
        query += f" WHERE {where_clause}"
    query += " ORDER BY playerName"
    
    return conn.execute(query).df()

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
st.markdown("Explore junior tennis player rankings and statistics")

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

# Main page tabs
tab1, tab2, tab3 = st.tabs(["Players", "Rankings Analysis", "County Statistics"])

with tab1:
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
                title=f"Tournament Count for {player_details['playerName']}",
                labels={'week': 'Month', 'tournaments': 'Tournament Count'}
            )

            fig.add_scatter(
                x=player_rankings['week'],
                y=player_rankings['points'],
                name='Points',
                yaxis='y2',
                line=dict(color='red')
            )

            # Update the layout to create a secondary y-axis and set ranges to start at 0
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
            
            # Show tabular data
            st.dataframe(player_rankings, use_container_width=True, hide_index=True)
        else:
            st.info("No ranking data available for this player")

with tab2:
    st.header("Rankings Analysis")
    
    # Get weeks for selection
    weeks = get_unique_weeks()
    selected_week = st.selectbox("Select Week for Analysis", weeks)
    
    # Query to get rankings for the selected week
    query = f"""
    SELECT p.playerName, p.county, p.year, r.points, r.tournaments
    FROM rankings r
    JOIN players p ON r.playerId = p.playerId
    WHERE r.week = '{selected_week}'
    ORDER BY r.points DESC
    LIMIT 100
    """
    week_rankings = conn.execute(query).df()
    
    if not week_rankings.empty:
        st.subheader(f"Top 100 Players for {selected_week}")
        st.dataframe(week_rankings, use_container_width=True, hide_index=True)
        
        # Tournament distribution
        st.subheader("Tournament Count Distribution")
        fig = px.histogram(
            week_rankings, 
            x='tournaments',
            title="Distribution of Tournament Counts",
            labels={'tournaments': 'Number of Tournaments', 'count': 'Number of Players'}
        )
        st.plotly_chart(fig, use_container_width=True)
        
        # County breakdown
        st.subheader("County Breakdown")
        county_counts = week_rankings['county'].value_counts().reset_index()
        county_counts.columns = ['county', 'count']
        
        fig = px.bar(
            county_counts.head(15), 
            x='county', 
            y='count',
            title="Top Counties by Player Count in Top 100",
            labels={'county': 'County', 'count': 'Number of Players'}
        )
        st.plotly_chart(fig, use_container_width=True)
    else:
        st.info(f"No ranking data available for {selected_week}")

with tab3:
    st.header("County Statistics")
    
    # Get player count by county
    county_stats = get_player_count_by_county()
    
    # Show county stats
    st.subheader("Player Distribution by County")
    
    col1, col2 = st.columns([2, 1])
    
    with col1:
        fig = px.bar(
            county_stats.head(15), 
            x='county', 
            y='player_count',
            title="Top 15 Counties by Player Count",
            labels={'county': 'County', 'player_count': 'Number of Players'}
        )
        st.plotly_chart(fig, use_container_width=True)
    
    with col2:
        st.dataframe(county_stats, use_container_width=True, hide_index=True)

# Footer
st.markdown("---")
st.caption("Tennis Rankings Dashboard • Created with Streamlit")
